// 동행복권 공개 API에서 최신 회차 당첨 정보를 수집하고,
// 1·2등 배출 판매점 발표 텍스트를 Cascading Match로 stores와 연결해
// draw_history 테이블에 upsert한다.
//
// 실행: npm run ingest:draws (GitHub Actions sync-data.yml에서 매일 1회 자동 실행)
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { normalizeAddress } from "./lib/addressNormalizer";
import { geocodeAddress } from "./lib/vworldGeo";
import { cascadingMatch } from "./lib/cascadingMatcher";
import { getPrizeStoresFromSeed } from "./lib/seedData";

const DHLOTTERY_ENDPOINT = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=";

interface DhLotteryResponse {
  returnValue: "success" | "fail";
  drwNo: number;
  drwNoDate: string;
  drwtNo1: number;
  drwtNo2: number;
  drwtNo3: number;
  drwtNo4: number;
  drwtNo5: number;
  drwtNo6: number;
  bnusNo: number;
  firstWinamnt: number;
  firstPrzwnerCo: number;
  firstAccumamnt: number;
  totSellamnt: number;
}

interface PrizeStoreAnnouncement {
  name: string;
  address: string;
}

async function fetchDraw(drwNo: number): Promise<DhLotteryResponse | null> {
  const res = await fetch(`${DHLOTTERY_ENDPOINT}${drwNo}`);
  const json = (await res.json()) as DhLotteryResponse;
  return json.returnValue === "success" ? json : null;
}

/**
 * 회차별 1·2등 배출점 발표(상호명 + 주소) 조회.
 *
 * 구현 전략 (하이브리드):
 * 1. 공공데이터포털 API에서 1등 배출점 수집 (공식 데이터)
 * 2. 필요시 시드 데이터(seed.ts) 또는 Playwright로 2등 수집
 *
 * 참고 자료:
 * - 공공데이터포털: "온라인복권 1등 당첨 판매점 현황 정보" (ID: 15059963)
 * - GitHub smok95/lotto: 배출점 JSON 데이터
 * - GitHub youngcheon/auto-lotto-purchase-ts: Cheerio 파싱 방식
 */

// 공공데이터포털 API 사용 (1등 배출점)
async function fetchPrizeStoresByDataGoKr(drwNo: number): Promise<PrizeStoreAnnouncement[]> {
  try {
    const apiKey = process.env.DATA_GO_KR_API_KEY;
    if (!apiKey) {
      console.warn(
        "DATA_GO_KR_API_KEY 환경변수가 없습니다. " +
        "공공데이터포털(data.go.kr) '온라인복권 1등 판매점' 데이터셋에서 API 키를 발급받으세요.",
      );
      return [];
    }

    // 공공데이터포털 "온라인복권 1등 당첨 판매점 현황" API
    // 데이터셋 ID: 15059963
    // https://www.data.go.kr/data/15059963/openapi.do
    const url = "https://api.data.go.kr/openapi/tn_pubr_public_lottery_first_prize_stores_api";
    const params = new URLSearchParams({
      serviceKey: apiKey,
      type: "json",
      numOfRows: "1000",
      pageNo: "1",
      drwNo: String(drwNo), // 회차 번호로 필터링
    });

    const res = await fetch(`${url}?${params}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      console.warn(`[draw ${drwNo}] 공공데이터포털 API 요청 실패: ${res.status}`);
      return [];
    }

    const json = (await res.json()) as {
      response?: {
        body?: {
          items?: Array<{
            bizplcNm?: string;
            rdnmadr?: string;
            lnmadr?: string;
          }>;
        };
      };
    };

    const items = json.response?.body?.items ?? [];
    const stores = items
      .map((item) => ({
        name: item.bizplcNm || "",
        address: item.rdnmadr || item.lnmadr || "",
      }))
      .filter((store) => store.name && store.address);

    if (stores.length > 0) {
      console.log(`[draw ${drwNo}] 공공데이터포털 API: 1등 배출점 ${stores.length}건 수집`);
    }

    return stores;
  } catch (error) {
    console.warn(
      `[draw ${drwNo}] 공공데이터포털 API 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// 시드 데이터 폴백 (오픈소스 데이터, GitHub 데이터 등)
async function fetchPrizeStoresBySeedData(drwNo: number, rank: 1 | 2): Promise<PrizeStoreAnnouncement[]> {
  try {
    const seedStores = getPrizeStoresFromSeed(drwNo, rank);

    if (seedStores.length === 0) {
      return [];
    }

    // 시드 데이터를 PrizeStoreAnnouncement 형식으로 변환
    const announcements: PrizeStoreAnnouncement[] = seedStores.map((store) => ({
      name: store.name,
      address: store.address,
    }));

    return announcements;
  } catch (error) {
    console.warn(`[draw ${drwNo}] 시드 데이터 로드 실패: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function fetchPrizeStoreAnnouncements(
  drwNo: number,
  rank: 1 | 2,
): Promise<PrizeStoreAnnouncement[]> {
  const rankLabel = rank === 1 ? "1등" : "2등";

  console.log(`\n🔍 [draw ${drwNo}] ${rankLabel} 배출점 정보 수집 시작...`);

  // 1단계: 공공데이터포털 API (1등은 공식 데이터 있음)
  if (rank === 1) {
    const stores = await fetchPrizeStoresByDataGoKr(drwNo);
    if (stores.length > 0) {
      console.log(`✅ [draw ${drwNo}] ${rankLabel} 배출점: ${stores.length}건`);
      return stores;
    }
  }

  // 2단계: 시드 데이터 폴백 (수동으로 준비된 데이터)
  const seedStores = await fetchPrizeStoresBySeedData(drwNo, rank);
  if (seedStores.length > 0) {
    console.log(`✅ [draw ${drwNo}] ${rankLabel} 배출점(시드): ${seedStores.length}건`);
    return seedStores;
  }

  // 3단계: 실패 시 빈 배열 반환
  console.warn(
    `⚠️  [draw ${drwNo}] ${rankLabel} 배출점을 수집할 수 없습니다.\n` +
    `  - 공공데이터포털: API 키 확인 필수\n` +
    `  - 시드 데이터: seed/prize_stores.json 추가 필요\n` +
    `  - 상세 정보: PRIZE_STORE_SOLUTION.md 참고`,
  );

  return [];
}

async function resolvePrizeStoreIds(drwNo: number, rank: 1 | 2): Promise<string[]> {
  const announcements = await fetchPrizeStoreAnnouncements(drwNo, rank);
  const storeIds: string[] = [];

  for (const announcement of announcements) {
    const normalized = normalizeAddress(announcement.address);
    const coords = await geocodeAddress(normalized.normalized);
    if (!coords) {
      console.warn(`[draw ${drwNo}] 지오코딩 실패, 매칭 스킵: ${announcement.name}`);
      continue;
    }

    const matchedId = await cascadingMatch({
      name: announcement.name,
      latitude: coords.latitude,
      longitude: coords.longitude,
      buildingMain: normalized.buildingMain,
      buildingSub: normalized.buildingSub,
    });

    if (!matchedId) {
      console.warn(`[draw ${drwNo}] 매장 매칭 실패(미등록/폐업 가능): ${announcement.name}`);
      continue;
    }

    storeIds.push(matchedId);
  }

  return storeIds;
}

async function getLastStoredDrawNo(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("draw_history")
    .select("draw_no")
    .order("draw_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.draw_no ?? 0;
}

async function main() {
  console.log("🚀 동행복권 당첨 회차 데이터 수집 시작...");
  console.log(`API: ${DHLOTTERY_ENDPOINT}`);
  console.log("");

  try {
    const lastDrawNo = await getLastStoredDrawNo();
    let drwNo = lastDrawNo + 1;
    let inserted = 0;
    let failed = 0;

    console.log(`📍 마지막 저장 회차: ${lastDrawNo || "없음"}`);
    console.log(`🔄 다음 회차부터 수집: ${drwNo}`);
    console.log("");

    for (;;) {
      try {
        const draw = await fetchDraw(drwNo);
        if (!draw) {
          console.log(`⏹️  회차 ${drwNo}: 아직 발표되지 않음`);
          break;
        }

        console.log(`📄 회차 ${drwNo} (${draw.drwNoDate}): 당첨번호 ${[draw.drwtNo1, draw.drwtNo2, draw.drwtNo3, draw.drwtNo4, draw.drwtNo5, draw.drwtNo6].join("-")}+${draw.bnusNo}`);

        const [firstPrizeStoreIds, secondPrizeStoreIds] = await Promise.all([
          resolvePrizeStoreIds(draw.drwNo, 1),
          resolvePrizeStoreIds(draw.drwNo, 2),
        ]);

        console.log(`  • 1등 배출점: ${firstPrizeStoreIds.length}건, 2등 배출점: ${secondPrizeStoreIds.length}건`);

        const { error } = await supabaseAdmin.from("draw_history").upsert(
          {
            draw_no: draw.drwNo,
            draw_date: draw.drwNoDate,
            winning_numbers: [draw.drwtNo1, draw.drwtNo2, draw.drwtNo3, draw.drwtNo4, draw.drwtNo5, draw.drwtNo6],
            bonus_number: draw.bnusNo,
            first_prize_total_amount: draw.firstAccumamnt,
            first_prize_winner_count: draw.firstPrzwnerCo,
            first_prize_amount_per_win: draw.firstWinamnt,
            total_sales_amount: draw.totSellamnt,
            first_prize_store_ids: firstPrizeStoreIds,
            second_prize_store_ids: secondPrizeStoreIds,
          },
          { onConflict: "draw_no" },
        );

        if (error) {
          console.error(`  ❌ DB 저장 실패: ${error.message}`);
          failed += 1;
        } else {
          console.log(`  ✅ 저장 완료`);
          inserted += 1;
        }

        drwNo += 1;
      } catch (error) {
        console.error(`❌ 회차 ${drwNo} 처리 실패:`, error instanceof Error ? error.message : String(error));
        failed += 1;
        drwNo += 1;

        if (failed >= 3) {
          console.error("❌ 연속 3건 실패, 중단");
          break;
        }
      }
    }

    console.log("");
    console.log("✅ 완료!");
    console.log(`   저장: ${inserted}건 / 실패: ${failed}건`);
  } catch (error) {
    console.error("❌ 배치 실행 실패:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ 예상치 못한 오류:", err);
  process.exit(1);
});
