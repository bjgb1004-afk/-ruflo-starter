// scripts/ingest/fetchFullayerWinStores.ts로 수집한 회차별 당첨매장 기록(fullayer-win-records.json)을
// 1) 우리 stores 테이블과 매칭해서 store_id를 확정하고 (매칭 안 되면 건너뜀 - 신규 매장 추가는 범위 밖),
// 2) 매칭된 매장의 전화번호를 비어있으면 채우고,
// 3) GitHub 오픈미러(smok95/lotto)에서 당첨번호(winning_numbers/bonus_number)를 받아와
// 4) draw_history를 262~1235회 전체로 재구축한다 (기존 10건짜리 sparse 데이터를 대체).
//
// draw_history가 이제 18년치 실제 기록을 담게 되므로, 기존 historical_first/second_prize_count
// "베이스라인 스냅샷" 컬럼과 이중 계산되지 않도록 함께 0으로 초기화한다 - 더 정확한 소스로 대체됨.
//
// 실행: DRY_RUN=1 npx tsx scripts/ingest/rebuildDrawHistoryFromFullayer.ts (매칭률만 확인, DB 미반영)
//      npx tsx scripts/ingest/rebuildDrawHistoryFromFullayer.ts (실제 반영)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { loadAllStores, buildGrid, findMatch } from "./lib/fullayerStoreMatcher";
import type { FullayerWinRecord } from "./fetchFullayerWinStores";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REQUEST_DELAY_MS = 50;

interface OpenLottoResult {
  draw_no: number;
  numbers: number[];
  bonus_no: number;
  date: string;
}

async function fetchDrawNumbers(drawNo: number): Promise<{ numbers: number[]; bonus: number; date: string } | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/smok95/lotto/master/results/${drawNo}.json`);
    if (!res.ok) return null;
    const d = (await res.json()) as OpenLottoResult;
    return { numbers: d.numbers, bonus: d.bonus_no, date: d.date.split("T")[0] };
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const isDryRun = process.env.DRY_RUN === "1";
  const recordsPath = path.resolve(__dirname, "../../fullayer-win-records.json");
  const records: FullayerWinRecord[] = JSON.parse(fs.readFileSync(recordsPath, "utf-8"));
  console.log(`📄 수집된 원본 레코드: ${records.length}건\n`);

  console.log("🏪 stores 테이블 로드 중...");
  const stores = await loadAllStores();
  console.log(`   ${stores.length}개 매장\n`);
  const index = buildGrid(stores);

  console.log("🔗 매칭 중...");
  const phoneUpdates = new Map<string, string>();
  const drawMap = new Map<number, { first: Set<string>; second: Set<string> }>();
  let matched = 0;
  let unmatched = 0;
  const unmatchedSamples: string[] = [];

  for (const r of records) {
    const store = findMatch(r, index);
    if (!store) {
      unmatched++;
      if (unmatchedSamples.length < 20) unmatchedSamples.push(`${r.storeName} (${r.address})`);
      continue;
    }
    matched++;

    if (r.phone && !store.phone && !phoneUpdates.has(store.id)) {
      phoneUpdates.set(store.id, r.phone);
    }

    if (!drawMap.has(r.drawNo)) drawMap.set(r.drawNo, { first: new Set(), second: new Set() });
    const bucket = drawMap.get(r.drawNo)!;
    (r.rank === 1 ? bucket.first : bucket.second).add(store.id);
  }

  console.log(`   매칭 성공: ${matched}건 / 매칭 실패: ${unmatched}건 (매칭률 ${((matched / records.length) * 100).toFixed(1)}%)\n`);
  if (unmatchedSamples.length > 0) {
    console.log("=== 매칭 실패 샘플 ===");
    unmatchedSamples.forEach((s) => console.log(`  ${s}`));
    console.log();
  }
  console.log(`📞 전화번호 신규 확보: ${phoneUpdates.size}건`);
  console.log(`📅 회차 수: ${drawMap.size}개\n`);

  if (isDryRun) {
    console.log("⚠️  DRY_RUN 모드: DB 반영 없음. 매칭률/샘플만 확인.");
    return;
  }

  console.log("📞 전화번호 반영 중...");
  let phoneDone = 0;
  for (const [storeId, phone] of phoneUpdates) {
    const { error } = await (supabaseAdmin.from("stores") as any).update({ phone }).eq("id", storeId);
    if (!error) phoneDone++;
  }
  console.log(`   ${phoneDone}/${phoneUpdates.size}건 완료\n`);

  console.log("📥 당첨번호 수집 및 draw_history 재구축 중...");
  const drawNos = [...drawMap.keys()].sort((a, b) => a - b);
  let drawDone = 0;
  for (const drawNo of drawNos) {
    const numbers = await fetchDrawNumbers(drawNo);
    if (!numbers) {
      console.log(`   ⚠️ ${drawNo}회 당첨번호 조회 실패 - 건너뜀`);
      continue;
    }
    const bucket = drawMap.get(drawNo)!;
    const { error } = await (supabaseAdmin.from("draw_history") as any).upsert(
      {
        draw_no: drawNo,
        draw_date: numbers.date,
        winning_numbers: numbers.numbers,
        bonus_number: numbers.bonus,
        first_prize_store_ids: [...bucket.first],
        second_prize_store_ids: [...bucket.second],
      },
      { onConflict: "draw_no" },
    );
    if (error) {
      console.log(`   ❌ ${drawNo}회 반영 실패: ${error.message}`);
    } else {
      drawDone++;
    }
    if (drawDone % 100 === 0) console.log(`   진행: ${drawDone}/${drawNos.length}`);
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`   ${drawDone}/${drawNos.length}개 회차 반영 완료\n`);

  console.log("🧹 베이스라인 스냅샷 컬럼 초기화 중 (이제 draw_history가 전체 기간을 커버하므로 이중계산 방지)...");
  const { error: resetError } = await (supabaseAdmin
    .from("stores") as any)
    .update({ historical_first_prize_count: 0, historical_second_prize_count: 0 })
    .gt("historical_first_prize_count", -1); // 전체 행 대상 (조건 없는 update 방지용 트릭)
  if (resetError) console.error("   ❌ 초기화 실패:", resetError.message);
  else console.log("   ✅ 완료");

  console.log("\n🔄 랭킹 재계산 중...");
  const { error: refreshError } = await (supabaseAdmin.rpc as any)("refresh_store_ranking_stats");
  if (refreshError) console.error("   ❌ 재계산 실패:", refreshError.message);
  else console.log("   ✅ 완료");
}

main().catch((err) => {
  console.error("❌ 실행 실패:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
