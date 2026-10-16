// 회차별 배출점 레코드를 받아 stores 테이블의 store_id로 확정하고, 1등 구매방식까지 함께
// 뽑는다. 매주 도는 fetchDrawHistory.ts와 과거 회차 재수집(rebuildWinStoresFromOfficial.ts)이
// 같은 규칙을 써야 해서 여기로 모았다.
import { supabaseAdmin } from "./supabaseAdmin";
import { fetchDhlotteryWinStores, type PurchaseType, type WinStoreRecord } from "./dhlotteryWinStores";
import { fetchLottorichDraw } from "./lottorichStores";
import { findCandidates, normalizeStoreName, type StoreGridIndex } from "./storeMatcher";

export type { PurchaseType, WinStoreRecord };

export interface ResolvedWinStores {
  first: string[];
  second: string[];
  // 1등 배출점의 구매방식. draw_first_prize_methods의 PK가 (draw_no, store_id)라 매장당 한
  // 행뿐인데, 한 매장이 같은 회차에 자동·수동을 각각 배출한 경우가 있을 수 있다 - 어느
  // 쪽인지 정할 수 없으므로 그 매장은 아예 넣지 않는다(추정 금지).
  firstMethods: Map<string, PurchaseType>;
  unmatched: number;
}

// 배출점 레코드는 동행복권 공식 경로에서 받고, 그게 비거나 실패할 때만 기존
// lottorich.co.kr 경로로 떨어진다. 공식 쪽은 회차 당첨자 수와 정확히 일치하는 반면
// (1243회 1등 12건) lottorich는 좌표 없는 레코드를 버려야 해서 같은 회차가 7건이었다.
// 폴백을 남기는 이유는 배출점 소스 하나가 죽었을 때 회차 저장까지 막히던 사고를 겪었기
// 때문이다(fetchDrawHistory.ts의 resolvePrizeStoreIdsSafely 주석 참고).
export async function fetchWinStoreRecords(drawNo: number): Promise<WinStoreRecord[]> {
  try {
    const official = await fetchDhlotteryWinStores(drawNo);
    if (official.length > 0) return official;
    console.warn(`  ⚠️ 공식 배출점 0건 - lottorich.co.kr로 폴백`);
  } catch (error) {
    console.warn(
      `  ⚠️ 공식 배출점 조회 실패(${error instanceof Error ? error.message : String(error)}) - ` +
        `lottorich.co.kr로 폴백`,
    );
  }
  // lottorich 경로에는 구매방식이 없어 purchaseType은 null로 들어온다.
  return (await fetchLottorichDraw(drawNo)).map((r) => ({ ...r, purchaseType: null }));
}

// 같은 가게가 한 회차에 1등을 두 장 이상 배출하면 소스도 그만큼 레코드를 준다(동행복권
// 공식 응답은 장당 1건, lottorich는 win_cnt로). 예전 구현은 Set으로 모아 매장당 1건으로
// 접었고, 그 결과 store_ranking_stats가 unnest + count(*)로 세는 "1등 횟수"가 장수가 아닌
// "배출한 회차 수"가 됐다 - 2026-10-16 실측으로 1위 "스파"가 공식 52회인데 49로 나온
// 원인이다. 그래서 중복을 그대로 남긴다: 배열에 같은 id가 2번 들어가면 횟수도 2가 된다.
// (화면에서 "N곳"으로 쓰는 쪽은 drawHistoryApi에서 합쳐 보여준다.)
function groupKey(record: WinStoreRecord): string {
  return [
    record.rank,
    normalizeStoreName(record.storeName),
    record.latitude.toFixed(5),
    record.longitude.toFixed(5),
  ].join("|");
}

export function resolveWinStores(records: WinStoreRecord[], index: StoreGridIndex): ResolvedWinStores {
  // 이름·좌표가 같은 레코드는 같은 가게의 복수 당첨이다 - 한 묶음으로 묶어 한 번만 매칭하고
  // 장수만큼 배열에 반복해 넣는다. 반대로 서로 다른 가게인데(묶음이 다른데) 반경 안의 같은
  // 매장으로 몰리면 한쪽은 남의 실적을 가져가는 것이므로, 이미 배정된 매장은 건너뛰고 다음
  // 후보로 넘긴다(후보가 없으면 미매칭으로 남겨 로그에 드러낸다).
  const groups = new Map<string, WinStoreRecord[]>();
  for (const record of records) {
    const key = groupKey(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(record);
  }

  const first: string[] = [];
  const second: string[] = [];
  const firstMethods = new Map<string, PurchaseType>();
  const conflictingStoreIds = new Set<string>();
  const claimed = new Map<1 | 2, Set<string>>([
    [1, new Set()],
    [2, new Set()],
  ]);
  let unmatched = 0;

  // 이름이 정확히 맞고 가까운 묶음이 먼저 매장을 집도록 정렬한다 - 애매한 묶음이 먼저
  // 집어가서 확실한 묶음이 밀려나는 걸 막는다.
  const ordered = [...groups.values()]
    .map((group) => ({ group, candidates: findCandidates(group[0], index) }))
    .sort((a, b) => (b.candidates[0]?.sim ?? 0) - (a.candidates[0]?.sim ?? 0));

  for (const { group, candidates } of ordered) {
    const rank = group[0].rank;
    const taken = claimed.get(rank)!;
    const picked = candidates.find((c) => !taken.has(c.store.id));
    if (!picked) {
      unmatched += group.length;
      continue;
    }
    taken.add(picked.store.id);

    const target = rank === 1 ? first : second;
    for (let i = 0; i < group.length; i++) target.push(picked.store.id);
    if (rank === 2) continue;

    for (const record of group) {
      if (!record.purchaseType) continue;
      const known = firstMethods.get(picked.store.id);
      if (known && known !== record.purchaseType) conflictingStoreIds.add(picked.store.id);
      else firstMethods.set(picked.store.id, record.purchaseType);
    }
  }

  for (const storeId of conflictingStoreIds) firstMethods.delete(storeId);

  return { first, second, firstMethods, unmatched };
}

// 이 회차의 1등 구매방식을 새로 받은 값으로 맞춘다. 더 이상 1등 배출점이 아닌 매장의
// 옛 행을 남겨두면 회차 상세의 자동/수동 요약(getDrawWinnersDetail의 purchaseTypeSummary)이
// draw_no 기준으로 전부 세기 때문에 실제보다 부풀려진다 - 그래서 먼저 지운다.
export async function syncFirstPrizeMethods(
  drawNo: number,
  firstMethods: Map<string, PurchaseType>,
): Promise<void> {
  const keepIds = [...firstMethods.keys()];

  const stale = supabaseAdmin.from("draw_first_prize_methods").delete().eq("draw_no", drawNo);
  const { error: deleteError } = await (keepIds.length > 0
    ? stale.not("store_id", "in", `(${keepIds.join(",")})`)
    : stale);
  if (deleteError) throw new Error(`구매방식 정리 실패(${drawNo}회): ${deleteError.message}`);

  if (keepIds.length === 0) return;

  const { error } = await supabaseAdmin.from("draw_first_prize_methods").upsert(
    keepIds.map((storeId) => ({
      draw_no: drawNo,
      store_id: storeId,
      purchase_type: firstMethods.get(storeId)!,
    })),
    { onConflict: "draw_no,store_id" },
  );
  if (error) throw new Error(`구매방식 저장 실패(${drawNo}회): ${error.message}`);
}
