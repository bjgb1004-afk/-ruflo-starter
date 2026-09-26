// 과거 회차의 배출점(draw_history.first/second_prize_store_ids)과 1등 구매방식
// (draw_first_prize_methods)을 동행복권 공식 경로로 전량 재수집한다. 기존 데이터는
// lottorich.co.kr/fullayer.com 경로로 모은 것이라 회차당 배출점이 과소집계돼 있고
// (1243회 1등 6곳 → 공식 9곳), 명당 랭킹이 그 누적값 위에 계산된다.
//
// 실행:
//   DRY_RUN=1 npx tsx scripts/ingest/rebuildWinStoresFromOfficial.ts            (전체 미리보기, 쓰기 없음)
//   DRY_RUN=1 npx tsx scripts/ingest/rebuildWinStoresFromOfficial.ts --from=1200 --to=1243
//   npx tsx scripts/ingest/rebuildWinStoresFromOfficial.ts                      (실제 반영)
// 반영 후에는 npm run ingest:refresh-rankings 를 돌려 랭킹을 다시 계산해야 한다.
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { loadAllStores, buildGrid } from "./lib/storeMatcher";
import { fetchDhlotteryWinStores } from "./lib/dhlotteryWinStores";
import { resolveWinStores, syncFirstPrizeMethods } from "./lib/winStoreResolver";

const DRY_RUN = process.env.DRY_RUN === "1";
// 공식 서버에 회차당 1요청뿐이지만 1200회차를 연속으로 때리는 셈이라 간격을 둔다.
const REQUEST_DELAY_MS = 120;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function argValue(name: string): number | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return null;
  const parsed = Number(hit.split("=")[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

interface DrawRow {
  draw_no: number;
  first_prize_store_ids: string[] | null;
  second_prize_store_ids: string[] | null;
}

async function loadDraws(from: number | null, to: number | null): Promise<DrawRow[]> {
  const rows: DrawRow[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  // PostgREST가 응답을 1000행에서 조용히 자르므로 range로 페이징한다.
  while (true) {
    let query = supabaseAdmin
      .from("draw_history")
      .select("draw_no, first_prize_store_ids, second_prize_store_ids")
      .order("draw_no", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (from !== null) query = query.gte("draw_no", from);
    if (to !== null) query = query.lte("draw_no", to);

    const { data, error } = await query.returns<DrawRow[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  console.log(`🔁 배출점 공식 경로 재수집 ${DRY_RUN ? "(DRY RUN - 쓰기 없음)" : "(실제 반영)"}`);

  const draws = await loadDraws(argValue("from"), argValue("to"));
  console.log(`📍 대상 회차: ${draws.length}건 (${draws[0]?.draw_no}~${draws[draws.length - 1]?.draw_no})`);

  const stores = await loadAllStores();
  const index = buildGrid(stores);
  console.log(`🏪 ${stores.length}개 매장 로드 완료\n`);

  const stat = { grew: 0, same: 0, shrank: 0, empty: 0, failed: 0, methods: 0 };
  let firstBefore = 0;
  let firstAfter = 0;
  const shrankDraws: string[] = [];

  for (const row of draws) {
    const storedFirst = row.first_prize_store_ids?.length ?? 0;
    const storedSecond = row.second_prize_store_ids?.length ?? 0;

    let resolved;
    try {
      const records = await fetchDhlotteryWinStores(row.draw_no);
      if (records.length === 0) {
        stat.empty += 1;
        continue; // 공식에 데이터가 없는 옛 회차 - 기존 값을 그대로 둔다
      }
      resolved = resolveWinStores(records, index);
    } catch (error) {
      console.error(`  ❌ ${row.draw_no}회 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
      stat.failed += 1;
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    firstBefore += storedFirst;
    firstAfter += resolved.first.length;

    if (resolved.first.length < storedFirst) {
      stat.shrank += 1;
      if (shrankDraws.length < 20) {
        shrankDraws.push(`${row.draw_no}회 ${storedFirst}→${resolved.first.length}`);
      }
    } else if (resolved.first.length > storedFirst || resolved.second.length !== storedSecond) {
      stat.grew += 1;
    } else {
      stat.same += 1;
    }

    if (!DRY_RUN) {
      const { error } = await supabaseAdmin
        .from("draw_history")
        .update({ first_prize_store_ids: resolved.first, second_prize_store_ids: resolved.second })
        .eq("draw_no", row.draw_no);
      if (error) {
        console.error(`  ❌ ${row.draw_no}회 저장 실패: ${error.message}`);
        stat.failed += 1;
      } else if (resolved.firstMethods.size > 0) {
        await syncFirstPrizeMethods(row.draw_no, resolved.firstMethods);
        stat.methods += resolved.firstMethods.size;
      }
    } else if (resolved.firstMethods.size > 0) {
      stat.methods += resolved.firstMethods.size;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log("");
  console.log(`✅ ${DRY_RUN ? "미리보기" : "반영"} 완료`);
  console.log(`   증가/변화: ${stat.grew}회차 · 동일: ${stat.same}회차 · 감소: ${stat.shrank}회차`);
  console.log(`   공식 데이터 없음(건너뜀): ${stat.empty}회차 · 실패: ${stat.failed}회차`);
  console.log(`   1등 배출점 합계: ${firstBefore} → ${firstAfter}건`);
  console.log(`   1등 구매방식: ${stat.methods}건`);
  if (shrankDraws.length > 0) {
    console.log(`   ⚠️ 감소한 회차(최대 20개): ${shrankDraws.join(", ")}`);
  }
  if (!DRY_RUN) {
    console.log("");
    console.log("👉 이제 npm run ingest:refresh-rankings 를 실행해 랭킹을 재계산하세요.");
  }
}

main().catch((err) => {
  console.error("❌ 예상치 못한 오류:", err);
  process.exit(1);
});
