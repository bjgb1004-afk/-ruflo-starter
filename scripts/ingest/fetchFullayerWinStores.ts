// fullayer.com의 "당첨판매점" 페이지(/lottowinstore/fo/lottowinstorelist)는 262회차부터
// 회차별 1등/2등 당첨매장을 상호명/등수/전화번호/좌표와 함께 제공한다.
// 기존 소스(lottorich/게시판)는 "누적 총 횟수" 스냅샷만 줬는데, 여기는 회차마다 정확한
// 당첨 기록이라 (a) 전화번호 보강, (b) 1년/5년 내 당첨 통계를 정확하게 계산하는 데 쓸 수 있다.
//
// 서버가 페이지당 20건으로 고정하는 것으로 확인됨(큰 pagesize 요청은 무시됨) - 회차 단위로
// 필터링(ltws_count)해서 회차별로 순차 수집한다. 회차 하나에 보통 1등+2등 합쳐 20건을
// 넘는 경우가 있어 페이지네이션도 함께 처리한다.
//
// 실행: DRY_RUN=1 npx tsx scripts/ingest/fetchFullayerWinStores.ts (최근 20회차만, DB 미반영)
//      npx tsx scripts/ingest/fetchFullayerWinStores.ts --from=262 --to=1235 (전체 수집)
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUEST_DELAY_MS = 400;
const USER_AGENT = "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)";
const LATEST_DRAW_NO = 1235;
const EARLIEST_DRAW_NO = 262;
const ENDPOINT = "https://www.fullayer.com/lottowinstore/fo/lottowinstorelist";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FullayerWinRecord {
  drawNo: number;
  storeName: string;
  rank: 1 | 2;
  phone: string | null;
  address: string;
  latitude: number;
  longitude: number;
  fullayerStoreId: string | null;
}

async function fetchPage(drawNo: number, pageNum: number): Promise<string | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        s_pagenum: String(pageNum),
        s_pagesize: "20",
        ltws_count: String(drawNo),
      }).toString(),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseRows($: cheerio.CheerioAPI): FullayerWinRecord[] {
  const rows: FullayerWinRecord[] = [];

  $("table.table-board tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 7) return;

    const drawNo = parseInt($(tds[0]).text().trim(), 10);
    const storeLink = $(tds[1]).find("a");
    const storeName = storeLink.text().trim();
    const storeHref = storeLink.attr("href") || "";
    const storeIdMatch = storeHref.match(/lottostoreview\/(\d+)/);
    const rank = parseInt($(tds[3]).text().trim(), 10) as 1 | 2;
    const telHref = $(tds[4]).find("a").attr("href") || "";
    const phone = telHref.startsWith("tel:") ? telHref.slice(4).trim() || null : null;
    const address = $(tds[5]).text().trim();

    const mapOnclick = $(tds[6]).find("a").attr("onclick") || "";
    const coordMatch = mapOnclick.match(/mapModal\([^,]+,\s*'([\d.]+)',\s*'([\d.]+)'\)/);

    if (!drawNo || !storeName || !coordMatch) return;

    rows.push({
      drawNo,
      storeName,
      rank: rank === 2 ? 2 : 1,
      phone,
      address,
      longitude: parseFloat(coordMatch[1]),
      latitude: parseFloat(coordMatch[2]),
      fullayerStoreId: storeIdMatch ? storeIdMatch[1] : null,
    });
  });

  return rows;
}

async function fetchDraw(drawNo: number): Promise<FullayerWinRecord[]> {
  const all: FullayerWinRecord[] = [];
  let pageNum = 1;
  while (true) {
    const html = await fetchPage(drawNo, pageNum);
    if (!html) break;
    const $ = cheerio.load(html);
    const rows = parseRows($);
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 20) break; // 마지막 페이지
    pageNum++;
    await sleep(REQUEST_DELAY_MS);
  }
  return all;
}

async function main() {
  const args = process.argv.slice(2);
  const fromArg = args.find((a) => a.startsWith("--from="));
  const toArg = args.find((a) => a.startsWith("--to="));

  const isDryRun = process.env.DRY_RUN === "1";
  const from = fromArg ? parseInt(fromArg.split("=")[1], 10) : isDryRun ? LATEST_DRAW_NO - 19 : EARLIEST_DRAW_NO;
  const to = toArg ? parseInt(toArg.split("=")[1], 10) : LATEST_DRAW_NO;

  console.log(`📡 회차 ${from}~${to} 수집 시작 (${to - from + 1}개 회차)${isDryRun ? " [DRY RUN]" : ""}\n`);

  const outPath = path.resolve(__dirname, "../../fullayer-win-records.json");
  const all: FullayerWinRecord[] = [];

  for (let drawNo = from; drawNo <= to; drawNo++) {
    const records = await fetchDraw(drawNo);
    all.push(...records);
    console.log(`  회차 ${drawNo}: ${records.length}건 (누적 ${all.length}건)`);
    // 진행 중 중단돼도 그때까지 결과는 남도록 매 회차마다 저장
    fs.writeFileSync(outPath, JSON.stringify(all));
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\n✅ 총 ${all.length}건 수집됨 → ${outPath}\n`);
  console.log("=== 샘플 ===");
  all.slice(0, 15).forEach((r) => {
    console.log(
      `${r.drawNo}회 ${r.rank}등 | ${r.storeName} | ${r.phone ?? "(전화없음)"} | ${r.address} | (${r.latitude}, ${r.longitude})`,
    );
  });

  if (isDryRun) {
    console.log("\n⚠️  DRY_RUN 모드: DB 반영 없음");
  }
}

main().catch((err) => {
  console.error("❌ 실행 실패:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
