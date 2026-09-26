// 회차별 배출점 레코드를 받아 stores 테이블의 store_id로 확정하고, 1등 구매방식까지 함께
// 뽑는다. 매주 도는 fetchDrawHistory.ts와 과거 회차 재수집(rebuildWinStoresFromOfficial.ts)이
// 같은 규칙을 써야 해서 여기로 모았다.
import { supabaseAdmin } from "./supabaseAdmin";
import { fetchDhlotteryWinStores, type PurchaseType, type WinStoreRecord } from "./dhlotteryWinStores";
import { fetchLottorichDraw } from "./lottorichStores";
import { findMatch, type StoreGridIndex } from "./storeMatcher";

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

export function resolveWinStores(records: WinStoreRecord[], index: StoreGridIndex): ResolvedWinStores {
  const first = new Set<string>();
  const second = new Set<string>();
  const firstMethods = new Map<string, PurchaseType>();
  const conflictingStoreIds = new Set<string>();
  let unmatched = 0;

  for (const record of records) {
    const store = findMatch(record, index);
    if (!store) {
      unmatched++;
      continue;
    }
    if (record.rank === 2) {
      second.add(store.id);
      continue;
    }

    first.add(store.id);
    if (!record.purchaseType) continue;
    const known = firstMethods.get(store.id);
    if (known && known !== record.purchaseType) conflictingStoreIds.add(store.id);
    else firstMethods.set(store.id, record.purchaseType);
  }

  for (const storeId of conflictingStoreIds) firstMethods.delete(storeId);

  return { first: [...first], second: [...second], firstMethods, unmatched };
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
