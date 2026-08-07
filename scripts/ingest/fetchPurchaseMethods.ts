// pyony.com/lotto/rounds/{회차}/ 에서 회차별 1등 배출점의 구매 방식(자동/수동/반자동)을
// 스크래핑해 draw_first_prize_methods에 반영한다. robots.txt 전체 허용 확인됨(2026-08-07).
//
// 매칭 전략: draw_history.first_prize_store_ids로 이미 우리 stores에 매칭되어 있는 매장
// 목록(보통 회차당 1~15개)만 후보로 두고, pyony가 스크래핑한 (이름, 주소)를 이름 정규화
// 비교로 매칭한다. 후보가 모호하거나 일치하는 게 없으면 그 행은 건너뛴다(임의 추정 금지).
//
// 실행: DRY_RUN=1 npx tsx scripts/ingest/fetchPurchaseMethods.ts --from=1226 --to=1235 (미리보기)
//      npx tsx scripts/ingest/fetchPurchaseMethods.ts (전체 회차, 이미 반영된 회차는 건너뜀)
//      FORCE=1 npx tsx scripts/ingest/fetchPurchaseMethods.ts --from=X --to=Y (재수집)
import * as cheerio from "cheerio";
import { supabaseAdmin } from "./lib/supabaseAdmin";

const REQUEST_DELAY_MS = 350;
const USER_AGENT = "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)";
const EARLIEST_DRAW_NO = 262;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PurchaseType = "자동" | "수동" | "반자동";

interface PyonyRow {
  name: string;
  purchaseType: PurchaseType;
  address: string;
}

function normalizeName(s: string): string {
  return s.replace(/[\s()（）\-.,]/g, "").toLowerCase();
}

async function fetchPyonyRound(drawNo: number): Promise<PyonyRow[] | null> {
  try {
    const res = await fetch(`https://pyony.com/lotto/rounds/${drawNo}/`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const rows: PyonyRow[] = [];

    $("table.table.small tbody tr, table.small tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 3) return;
      const name = $(tds[0]).text().trim();
      const typeText = $(tds[1]).text().trim();
      const address = $(tds[2]).text().trim().replace(/\s+/g, " ");
      if (!name || (typeText !== "자동" && typeText !== "수동" && typeText !== "반자동")) return;
      rows.push({ name, purchaseType: typeText as PurchaseType, address });
    });

    return rows;
  } catch {
    return null;
  }
}

async function getLatestDrawNo(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("draw_history")
    .select("draw_no")
    .order("draw_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.draw_no ?? EARLIEST_DRAW_NO;
}

async function getDrawsAlreadyDone(): Promise<Set<number>> {
  const done = new Set<number>();
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("draw_first_prize_methods")
      .select("draw_no")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    (data as any[]).forEach((r) => done.add(r.draw_no));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return done;
}

async function main() {
  const args = process.argv.slice(2);
  const fromArg = args.find((a) => a.startsWith("--from="));
  const toArg = args.find((a) => a.startsWith("--to="));
  const isDryRun = process.env.DRY_RUN === "1";
  const force = process.env.FORCE === "1";

  const latest = await getLatestDrawNo();
  const from = fromArg ? parseInt(fromArg.split("=")[1], 10) : EARLIEST_DRAW_NO;
  const to = toArg ? parseInt(toArg.split("=")[1], 10) : latest;

  const alreadyDone = force ? new Set<number>() : await getDrawsAlreadyDone();

  console.log(
    `📡 회차 ${from}~${to} 구매방식 수집 시작 (이미 처리됨 ${alreadyDone.size}건 건너뜀)${isDryRun ? " [DRY RUN]" : ""}\n`,
  );

  let totalMatched = 0;
  let totalUnmatched = 0;
  let drawsProcessed = 0;
  const unmatchedSamples: string[] = [];

  for (let drawNo = from; drawNo <= to; drawNo++) {
    if (alreadyDone.has(drawNo)) continue;

    const { data: draw, error: drawError } = await supabaseAdmin
      .from("draw_history")
      .select("first_prize_store_ids")
      .eq("draw_no" as any, drawNo as any)
      .maybeSingle();
    if (drawError) throw drawError;
    const storeIds: string[] = (draw as any)?.first_prize_store_ids ?? [];
    if (storeIds.length === 0) continue;

    const { data: candidates, error: storesError } = await supabaseAdmin
      .from("stores")
      .select("id, name, address")
      .in("id", storeIds as any);
    if (storesError) throw storesError;
    const candidateList = (candidates as any[]) ?? [];

    const pyonyRows = await fetchPyonyRound(drawNo);
    await sleep(REQUEST_DELAY_MS);
    if (pyonyRows === null) {
      console.log(`  ${drawNo}회: pyony 조회 실패 - 건너뜀`);
      continue;
    }

    const insertsByStoreId = new Map<string, { draw_no: number; store_id: string; purchase_type: PurchaseType }>();
    const conflictingStoreIds = new Set<string>();
    for (const row of pyonyRows) {
      const normalizedTarget = normalizeName(row.name);
      const exactMatches = candidateList.filter((c) => normalizeName(c.name) === normalizedTarget);
      const match = exactMatches.length === 1 ? exactMatches[0] : null;
      if (!match) {
        totalUnmatched++;
        if (unmatchedSamples.length < 20) {
          unmatchedSamples.push(`${drawNo}회 "${row.name}" (후보 ${exactMatches.length}개)`);
        }
        continue;
      }
      // pyony 목록에 같은 매장으로 매칭되는 행이 두 번 이상 나오면(사이트 자체 중복 등)
      // 어느 쪽이 맞는지 알 수 없으므로 그 매장은 통째로 건너뛴다(임의로 하나를 고르지 않음).
      if (insertsByStoreId.has(match.id)) {
        conflictingStoreIds.add(match.id);
        continue;
      }
      totalMatched++;
      insertsByStoreId.set(match.id, { draw_no: drawNo, store_id: match.id, purchase_type: row.purchaseType });
    }

    for (const conflictId of conflictingStoreIds) {
      if (insertsByStoreId.delete(conflictId)) totalMatched--;
    }
    const inserts = [...insertsByStoreId.values()];

    if (!isDryRun && inserts.length > 0) {
      const { error: upsertError } = await (supabaseAdmin.from("draw_first_prize_methods") as any).upsert(inserts, {
        onConflict: "draw_no,store_id",
      });
      if (upsertError) console.log(`  ${drawNo}회: 저장 실패 - ${upsertError.message}`);
    }

    drawsProcessed++;
    if (drawsProcessed % 50 === 0) {
      console.log(`  진행: ${drawsProcessed}건 처리 (누적 매칭 ${totalMatched} / 미매칭 ${totalUnmatched})`);
    }
  }

  console.log(`\n✅ 완료: ${drawsProcessed}개 회차 처리, 매칭 ${totalMatched}건 / 미매칭 ${totalUnmatched}건`);
  if (unmatchedSamples.length > 0) {
    console.log("\n=== 미매칭 샘플 ===");
    unmatchedSamples.forEach((s) => console.log(`  ${s}`));
  }
  if (isDryRun) console.log("\n⚠️  DRY_RUN 모드: DB 반영 없음");
}

main().catch((err) => {
  console.error("❌ 실행 실패:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
