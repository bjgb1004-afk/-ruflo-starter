// lottoen.com 인덱스 페이지(요청 1번)에 나오는 시군구별 매장 수와, 우리 DB의
// 시군구별 매장 수를 비교해 "커버리지 공백"이 어디에 얼마나 있는지 파악한다.
// 실행: npx tsx scripts/analyzeLottoenCoverage.ts
import * as cheerio from "cheerio";
import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";

const USER_AGENT = "Mozilla/5.0 (compatible; LottoMapAnalyzeBot/1.0; +personal-project)";

// enrichFromLottoen.ts와 동일한 매핑 (우리 sido 표기 → lottoen.com 그룹 키)
const SIDO_ALIAS: Record<string, string> = {
  광주광역시: "전남광주통합특별시",
  전라남도: "전남광주통합특별시",
  강원특별자치도: "강원도",
  전북특별자치도: "전라북도",
};

interface DistrictCount {
  sido: string;
  sigungu: string;
  count: number;
}

// 우리 DB는 성남시/고양시/수원시 등 분구형 도시를 구 단위로 쪼개지 않고
// "성남시" 하나로만 저장한다. lottoen은 "성남시 분당구"처럼 구까지 쪼개서 보여주므로,
// 정확한 비교를 위해 lottoen 쪽도 구를 떼고 도시 단위로 합산한다.
function toCityLevel(sigungu: string): string {
  return sigungu.split(" ")[0];
}

async function fetchLottoenCounts(): Promise<DistrictCount[]> {
  const res = await fetch("https://www.lottoen.com/lotto645/store/", {
    headers: { "User-Agent": USER_AGENT },
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const raw: DistrictCount[] = [];
  $("a").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/^\/lotto645\/store\/([^/]+)\/([^/]+)\/$/);
    if (!m) return;

    const text = $(a).text();
    const countMatch = text.match(/\((\d+)\)/);
    if (!countMatch) return;

    raw.push({
      sido: decodeURIComponent(m[1]),
      sigungu: decodeURIComponent(m[2]),
      count: parseInt(countMatch[1], 10),
    });
  });

  // 도시 단위로 합산 (예: "성남시 분당구"+"성남시 중원구"+"성남시 수정구" → "성남시")
  const merged = new Map<string, DistrictCount>();
  for (const r of raw) {
    const cityLevel = toCityLevel(r.sigungu);
    const key = `${r.sido}|${cityLevel}`;
    const existing = merged.get(key);
    if (existing) {
      existing.count += r.count;
    } else {
      merged.set(key, { sido: r.sido, sigungu: cityLevel, count: r.count });
    }
  }

  return [...merged.values()];
}

async function fetchOurDistrictCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("sido, sigungu")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!row.sido || !row.sigungu) continue;
      const lottoenSido = SIDO_ALIAS[row.sido] ?? row.sido;
      const key = `${lottoenSido}|${row.sigungu}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return counts;
}

async function main() {
  console.log("🔍 lottoen.com vs 우리 DB 커버리지 비교\n");

  const [lottoenCounts, ourCounts] = await Promise.all([fetchLottoenCounts(), fetchOurDistrictCounts()]);

  const lottoenTotal = lottoenCounts.reduce((sum, d) => sum + d.count, 0);
  const ourTotal = [...ourCounts.values()].reduce((sum, c) => sum + c, 0);

  console.log(`📊 전국 합계`);
  console.log(`   lottoen.com: ${lottoenTotal.toLocaleString()}개`);
  console.log(`   우리 DB:     ${ourTotal.toLocaleString()}개`);
  console.log(`   격차:        ${(lottoenTotal - ourTotal).toLocaleString()}개 (우리 DB에 없을 가능성)\n`);

  const gaps = lottoenCounts
    .map((d) => {
      const key = `${d.sido}|${d.sigungu}`;
      const ourCount = ourCounts.get(key) ?? 0;
      return { ...d, ourCount, gap: d.count - ourCount };
    })
    .sort((a, b) => b.gap - a.gap);

  console.log(`🔴 커버리지 공백이 큰 지역 TOP 30 (lottoen 수 - 우리 DB 수)`);
  console.log(`${"지역".padEnd(20)} ${"lottoen".padStart(8)} ${"우리DB".padStart(8)} ${"공백".padStart(8)}`);
  gaps.slice(0, 30).forEach((d) => {
    const label = `${d.sido} ${d.sigungu}`;
    console.log(
      `${label.padEnd(20)} ${String(d.count).padStart(8)} ${String(d.ourCount).padStart(8)} ${String(d.gap).padStart(8)}`,
    );
  });

  // 완전히 커버리지가 없는(우리 DB에 0개인) 지역 수
  const zeroCoverage = gaps.filter((d) => d.ourCount === 0 && d.count > 0);
  console.log(`\n⚠️ 우리 DB에 매장이 아예 0개인 지역: ${zeroCoverage.length}개 시군구`);
  console.log(`   (그 지역 lottoen 매장 합계: ${zeroCoverage.reduce((s, d) => s + d.count, 0).toLocaleString()}개)`);

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 오류:", err);
  process.exit(1);
});
