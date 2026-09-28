// 과거 회차의 배출점(draw_history.first/second_prize_store_ids)과 1등 구매방식
// (draw_first_prize_methods)을 동행복권 공식 경로로 전량 재수집한다. 기존 데이터는
// lottorich.co.kr/fullayer.com 경로로 모은 것이라 회차당 배출점이 과소집계돼 있고
// (1243회 1등 6곳 → 공식 9곳), 명당 랭킹이 그 누적값 위에 계산된다.
//
// 실행:
//   DRY_RUN=1 npx tsx scripts/ingest/rebuildWinStoresFromOfficial.ts            (전체 미리보기, 쓰기 없음)
//   DRY_RUN=1 npx tsx scripts/ingest/rebuildWinStoresFromOfficial.ts --from=1200 --to=1243
//   npx tsx scripts/ingest/rebuildWinStoresFromOfficial.ts                      (실제 반영)
//   REQUEST_DELAY_MS=600 npx tsx ... --from=776 --to=951                         (실패분만 다시)
//   npx tsx ... --chunk=20 --allow-shrink                                        (이어서 20회차만)
// 반영 후에는 npm run ingest:refresh-rankings 를 돌려 랭킹을 다시 계산해야 한다.
//
// 공식 서버는 연속 요청을 스로틀한다 - 2026-09-28 실측으로 982회차를 120ms 간격으로 돌린
// 결과 중간 176회차가 통째로 ConnectTimeout이 되고 끝난 뒤엔 IP 자체가 막혀 curl·ping도
// 죽었다(수십 분 뒤 복구). 그래서 기본 간격을 넉넉히 두고 회차당 재시도를 붙였다. 그래도
// 연속 실패가 쌓이면 스로틀로 보고 즉시 중단한다 - 계속 때리면 차단이 길어진다.
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { loadAllStores, buildGrid } from "./lib/storeMatcher";
import { fetchDhlotteryWinStores } from "./lib/dhlotteryWinStores";
import { resolveWinStores, syncFirstPrizeMethods } from "./lib/winStoreResolver";

const DRY_RUN = process.env.DRY_RUN === "1";
// 공식 서버에 회차당 1요청뿐이지만 1200회차를 연속으로 때리는 셈이라 간격을 둔다.
// 120ms로는 스로틀에 걸렸다(위 주석) - 실측 기반으로 500ms를 기본값으로 둔다.
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS ?? 500);
const FETCH_TRIES = 4;
// 이만큼 연속으로 실패하면 회차 문제가 아니라 차단이다 - 더 때리지 않고 끝낸다.
const ABORT_AFTER_CONSECUTIVE_FAILURES = 10;
// 새 결과가 기존보다 배출점이 적으면 데이터를 잃는 쪽이라 기본적으로 쓰지 않는다.
// 감소분까지 반영하려면 --allow-shrink 를 붙인다(감소 원인을 확인한 뒤에만).
const ALLOW_SHRINK = process.argv.includes("--allow-shrink");
// --chunk=N 이면 rebuild_progress에 남은 지점부터 N회차만 돌고 포인터를 옮긴다. 공식
// 서버가 연속 요청을 IP째 끊기 때문에 한 번에 다 돌 수 없어서 나눠 돌리는 모드다.
const PROGRESS_ID = "win-stores";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 스로틀·일시적 네트워크 오류는 회차 단위로 재시도한다. 첫 시도 실패 후 1s, 3s, 7s.
async function fetchWithRetry(drawNo: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchDhlotteryWinStores(drawNo);
    } catch (error) {
      if (attempt >= FETCH_TRIES - 1) throw error;
      await sleep(1000 * (2 ** attempt + attempt));
    }
  }
}

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

async function readProgress(): Promise<number> {
  const { data, error } = await (supabaseAdmin as any)
    .from("rebuild_progress")
    .select("next_draw_no")
    .eq("id", PROGRESS_ID)
    .single<{ next_draw_no: number }>();
  if (error) throw new Error(`진행 상황 조회 실패: ${error.message}`);
  return data.next_draw_no;
}

async function writeProgress(nextDrawNo: number): Promise<void> {
  const { error } = await (supabaseAdmin as any)
    .from("rebuild_progress")
    .update({ next_draw_no: nextDrawNo, updated_at: new Date().toISOString() })
    .eq("id", PROGRESS_ID);
  if (error) throw new Error(`진행 상황 저장 실패: ${error.message}`);
}

async function maxDrawNo(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("draw_history")
    .select("draw_no")
    .order("draw_no", { ascending: false })
    .limit(1)
    .single<{ draw_no: number }>();
  if (error) throw new Error(`마지막 회차 조회 실패: ${error.message}`);
  return data.draw_no;
}

async function main() {
  console.log(`🔁 배출점 공식 경로 재수집 ${DRY_RUN ? "(DRY RUN - 쓰기 없음)" : "(실제 반영)"}`);

  const chunk = argValue("chunk");
  let from = argValue("from");
  let to = argValue("to");
  if (chunk !== null) {
    const last = await maxDrawNo();
    from = await readProgress();
    to = from + chunk - 1;
    if (from > last) {
      // 워크플로가 이 줄을 보고 스케줄을 스스로 끈다.
      console.log(`REBUILD_COMPLETE 마지막 회차 ${last}까지 끝났습니다 - 더 돌 게 없습니다.`);
      return;
    }
    console.log(`📎 이어서 ${from}~${to}회 (마지막 회차 ${last})`);
  }

  const draws = await loadDraws(from, to);
  console.log(`📍 대상 회차: ${draws.length}건 (${draws[0]?.draw_no}~${draws[draws.length - 1]?.draw_no})`);

  const stores = await loadAllStores();
  const index = buildGrid(stores);
  console.log(`🏪 ${stores.length}개 매장 로드 완료\n`);

  const stat = { grew: 0, same: 0, shrank: 0, skipped: 0, empty: 0, failed: 0, methods: 0, unmatched: 0 };
  let consecutiveFailures = 0;
  // 확실히 처리한 마지막 회차. 조회 실패는 여기 안 들어가므로 다음 실행이 그 자리에서 다시 한다.
  let handledThrough: number | null = null;
  let firstBefore = 0;
  let firstAfter = 0;
  const shrankDraws: string[] = [];

  for (const row of draws) {
    const storedFirst = row.first_prize_store_ids?.length ?? 0;
    const storedSecond = row.second_prize_store_ids?.length ?? 0;

    let resolved;
    try {
      const records = await fetchWithRetry(row.draw_no);
      if (records.length === 0) {
        stat.empty += 1;
        handledThrough = row.draw_no;
        continue; // 공식에 데이터가 없는 옛 회차 - 기존 값을 그대로 둔다
      }
      resolved = resolveWinStores(records, index);
      consecutiveFailures = 0;
    } catch (error) {
      console.error(`  ❌ ${row.draw_no}회 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
      stat.failed += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= ABORT_AFTER_CONSECUTIVE_FAILURES) {
        console.error(
          `
🛑 ${consecutiveFailures}회차 연속 실패 - 공식 서버 차단으로 보고 ${row.draw_no}회에서 중단합니다.
` +
            `   잠시 뒤 --from=${row.draw_no - consecutiveFailures + 1} 로 이어서 돌리세요.`,
        );
        break;
      }
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const shrinking = resolved.first.length < storedFirst;
    firstBefore += storedFirst;
    // 감소 회차는 쓰지 않으므로 기존 값이 그대로 남는다 - 합계도 그렇게 센다.
    firstAfter += shrinking && !ALLOW_SHRINK ? storedFirst : resolved.first.length;
    stat.unmatched += resolved.unmatched;
    if (shrinking) {
      stat.shrank += 1;
      if (shrankDraws.length < 30) {
        shrankDraws.push(
          `${row.draw_no}회 ${storedFirst}→${resolved.first.length}` +
            (resolved.unmatched > 0 ? `(미매칭 ${resolved.unmatched})` : ""),
        );
      }
    } else if (resolved.first.length > storedFirst || resolved.second.length !== storedSecond) {
      stat.grew += 1;
    } else {
      stat.same += 1;
    }

    // 감소 회차는 건드리지 않는다. 공식 응답이 실제로 적은 건지, 좌표·상호가 stores와
    // 안 맞아 findMatch가 버린 건지(resolved.unmatched) 가리기 전에 덮으면 데이터를 잃는다.
    if (shrinking && !ALLOW_SHRINK) {
      stat.skipped += 1;
      handledThrough = row.draw_no;
      await sleep(REQUEST_DELAY_MS);
      continue;
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

    handledThrough = row.draw_no;
    await sleep(REQUEST_DELAY_MS);
  }

  if (chunk !== null && !DRY_RUN && handledThrough !== null) {
    await writeProgress(handledThrough + 1);
    console.log(`📎 다음 실행은 ${handledThrough + 1}회부터 이어갑니다.`);
  }

  console.log("");
  console.log(`✅ ${DRY_RUN ? "미리보기" : "반영"} 완료`);
  console.log(
    `   증가/변화: ${stat.grew}회차 · 동일: ${stat.same}회차 · 감소: ${stat.shrank}회차` +
      (ALLOW_SHRINK ? " (감소분도 반영)" : ` (그중 ${stat.skipped}회차는 쓰지 않고 건너뜀)`),
  );
  console.log(`   stores 테이블에서 못 찾아 버린 배출점 레코드: ${stat.unmatched}건`);
  console.log(`   공식 데이터 없음(건너뜀): ${stat.empty}회차 · 실패: ${stat.failed}회차`);
  console.log(`   1등 배출점 합계: ${firstBefore} → ${firstAfter}건`);
  console.log(`   1등 구매방식: ${stat.methods}건`);
  if (shrankDraws.length > 0) {
    console.log(`   ⚠️ 감소한 회차(최대 30개): ${shrankDraws.join(", ")}`);
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
