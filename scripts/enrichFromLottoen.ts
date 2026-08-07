// lottoen.com에서 우리 기존 store_ranking_stats(1,706개)에 해당하는 매장을
// 찾아 주소/최근당첨일을 "참고용" 컬럼(stores.lottoen_*)에 채워 넣는다.
// 기존 address/좌표 파이프라인은 건드리지 않는다 (비교/검증 목적).
//
// 상대 서버 부하 최소화 설계:
//  - 시군구 인덱스 페이지는 (시도,시군구) 조합당 최대 1번(페이지네이션 시 최대 3페이지)만 요청,
//    같은 지역에 우리 매장이 여러 개 있어도 재사용한다.
//  - 매칭 성공한 매장만 상세페이지 요청 (실패분은 건너뜀).
//  - 모든 요청 사이 450ms 딜레이, 동시 요청 없음(완전 순차).
//
// 실행: npx tsx scripts/enrichFromLottoen.ts
import * as cheerio from "cheerio";
import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";

const REQUEST_DELAY_MS = 450;
const MAX_PAGES_PER_DISTRICT = 3;
const USER_AGENT = "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 우리 sido 표기 → lottoen.com 그룹 키 (일부 지역은 lottoen이 통합/다른 명칭 사용)
const SIDO_ALIAS: Record<string, string> = {
  광주광역시: "전남광주통합특별시",
  전라남도: "전남광주통합특별시",
  강원특별자치도: "강원도",
  전북특별자치도: "전라북도",
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function normalizeName(name: string): string {
  return name.replace(/[\s()（）·・.,-]/g, "").toLowerCase();
}

// 1) 전국 시도/시군구 → URL 맵 (요청 1번)
async function buildDistrictIndex(): Promise<Map<string, Map<string, string>>> {
  const html = await fetchHtml("https://www.lottoen.com/lotto645/store/");
  const index = new Map<string, Map<string, string>>();
  if (!html) return index;

  const $ = cheerio.load(html);
  $("a").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/^\/lotto645\/store\/([^/]+)\/([^/]+)\/$/);
    if (!m) return;
    const sido = decodeURIComponent(m[1]);
    const sigungu = decodeURIComponent(m[2]);
    if (!index.has(sido)) index.set(sido, new Map());
    index.get(sido)!.set(sigungu, href);
  });

  return index;
}

// 2) 시군구 페이지(페이지네이션 포함)에서 매장명 → 상세페이지 URL 맵 구성
async function fetchDistrictStores(baseHref: string): Promise<Map<string, string>> {
  const nameToUrl = new Map<string, string>();

  for (let page = 1; page <= MAX_PAGES_PER_DISTRICT; page++) {
    const url = `https://www.lottoen.com${baseHref}${page > 1 ? `?&p=${page}` : ""}`;
    const html = await fetchHtml(url);
    await sleep(REQUEST_DELAY_MS);
    if (!html) break;

    const $ = cheerio.load(html);
    let foundOnPage = 0;

    $("a").each((_, a) => {
      const href = $(a).attr("href") || "";
      const nameEl = $(a).find(".name").first();
      if (!nameEl.length) return;
      // 시군구/동 인덱스 링크(class="name"+cnt)와 실제 매장 링크를 구분:
      // 매장 상세 링크는 .../동이름/매장명_해시 형태로 세그먼트가 하나 더 많다.
      const segments = href.replace(/^\/lotto645\/store\//, "").split("/").filter(Boolean);
      if (segments.length < 3) return; // 시도/시군구/동 까지만 있으면 인덱스 링크

      const storeName = nameEl.text().trim();
      if (storeName) {
        nameToUrl.set(normalizeName(storeName), href);
        foundOnPage++;
      }
    });

    // 다음 페이지 존재 여부 확인 (pagination에 p=page+1 링크가 있는지)
    const hasNextPage = $(`a[href*="p=${page + 1}"]`).length > 0;
    if (!hasNextPage || foundOnPage === 0) break;
  }

  return nameToUrl;
}

interface LottoenDetail {
  address: string | null;
  firstPrizeNote: string | null;
  secondPrizeNote: string | null;
}

async function fetchStoreDetail(href: string): Promise<LottoenDetail> {
  const html = await fetchHtml(`https://www.lottoen.com${href}`);
  if (!html) return { address: null, firstPrizeNote: null, secondPrizeNote: null };

  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ");

  const addressMatch = bodyText.match(/주소\s+([^\d]*\d[^최]*?)(?=\s*(?:하이퍼툴박스|무료 온라인|$))/);
  const recentDates = [...bodyText.matchAll(/최근당첨일\s+([^\s]+(?:\s+전)?)/g)].map((m) => m[1]);

  return {
    address: addressMatch?.[1]?.trim() ?? null,
    firstPrizeNote: recentDates[0] ?? null,
    secondPrizeNote: recentDates[1] ?? null,
  };
}

async function main() {
  console.log("🚀 lottoen.com 교차 검증 시작\n");

  console.log("1️⃣ 전국 시도/시군구 인덱스 구성 중...");
  const districtIndex = await buildDistrictIndex();
  console.log(`   ${districtIndex.size}개 시도, 총 ${[...districtIndex.values()].reduce((a, m) => a + m.size, 0)}개 시군구 확인\n`);
  await sleep(REQUEST_DELAY_MS);

  const stores: { id: string; name: string; sido: string | null; sigungu: string | null }[] = [];
  {
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from("store_ranking_stats")
        .select("id, name, sido, sigungu")
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      stores.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  if (stores.length === 0) {
    console.log("대상 매장 없음");
    process.exit(0);
  }
  console.log(`2️⃣ 대상 매장: ${stores.length}개\n`);

  // (sido, sigungu) 조합별로 그룹핑 → 지역 페이지를 중복 요청하지 않도록
  const byDistrict = new Map<string, typeof stores>();
  for (const store of stores) {
    if (!store.sido || !store.sigungu) continue;
    const key = `${store.sido}|${store.sigungu}`;
    if (!byDistrict.has(key)) byDistrict.set(key, []);
    byDistrict.get(key)!.push(store);
  }
  console.log(`3️⃣ 필요한 지역(시군구) 수: ${byDistrict.size}개\n`);

  const districtLimit = process.env.DISTRICT_LIMIT ? parseInt(process.env.DISTRICT_LIMIT, 10) : Infinity;
  const districtEntries = [...byDistrict.entries()].slice(0, districtLimit);

  let districtsFetched = 0;
  let nameMatched = 0;
  let detailSucceeded = 0;
  let detailFailed = 0;
  let districtNotFound = 0;
  const startTime = Date.now();

  for (const [key, storesInDistrict] of districtEntries) {
    const [sido, sigungu] = key.split("|");
    const lottoenSido = SIDO_ALIAS[sido] ?? sido;
    const districtHref = districtIndex.get(lottoenSido)?.get(sigungu);

    if (!districtHref) {
      districtNotFound++;
      continue;
    }

    const nameToUrl = await fetchDistrictStores(districtHref);
    districtsFetched++;

    for (const store of storesInDistrict) {
      const normalized = normalizeName(store.name);
      let matchedHref = nameToUrl.get(normalized);

      if (!matchedHref && normalized.length >= 3) {
        // 정확히 일치하는 게 없으면 부분 포함 매칭 시도.
        // 단, 후보가 2개 이상이면 오매칭 위험이 크므로(예: "로또대박"↔"로또왕대박"
        // 둘 다 "대박"을 포함해 서로 다른 lottoen 항목과 잘못 엮일 수 있음) 스킵한다.
        const candidates = new Set<string>();
        for (const [candidateName, href] of nameToUrl) {
          if (candidateName.includes(normalized) || normalized.includes(candidateName)) {
            candidates.add(href);
          }
        }
        if (candidates.size === 1) {
          matchedHref = [...candidates][0];
        }
      }

      if (!matchedHref) continue;
      nameMatched++;

      const detail = await fetchStoreDetail(matchedHref);
      await sleep(REQUEST_DELAY_MS);

      if (!detail.address && !detail.firstPrizeNote) {
        detailFailed++;
        continue;
      }

      const { error: updateError } = await supabaseAdmin
        .from("stores")
        .update({
          lottoen_address: detail.address,
          lottoen_first_prize_note: detail.firstPrizeNote,
          lottoen_second_prize_note: detail.secondPrizeNote,
          lottoen_verified_at: new Date().toISOString(),
        })
        .eq("id", store.id);

      if (updateError) {
        detailFailed++;
      } else {
        detailSucceeded++;
      }
    }

    if (districtsFetched % 20 === 0 || districtLimit < Infinity) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(
        `  진행: 지역 ${districtsFetched}/${districtEntries.length} · 매칭 ${nameMatched} · 성공 ${detailSucceeded} · 실패 ${detailFailed} - ${elapsed}초 경과`,
      );
    }
  }

  console.log(`\n✅ 완료`);
  console.log(`   지역 페이지 조회: ${districtsFetched}개 (지역 매핑 실패: ${districtNotFound}개)`);
  console.log(`   이름 매칭 성공: ${nameMatched}개`);
  console.log(`   상세정보 저장 성공: ${detailSucceeded}개`);
  console.log(`   상세정보 저장 실패: ${detailFailed}개`);

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 치명적 오류:", err);
  process.exit(1);
});
