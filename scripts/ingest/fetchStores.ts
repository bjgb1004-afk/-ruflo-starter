// 로또 판매점 목록을 수집해 stores 테이블에 upsert한다.
//
// 데이터 소스: 시드 데이터 (개발 초기) + V-World API (지오코딩/역지오코딩)
//
// 파이프라인: 주소 정규화 -> (좌표 없으면) V-World 지오코딩 -> V-World 역지오코딩
//            -> Cascading Match(좌표 미세 변동 중복 방지) -> UUID v5 결정 -> upsert
//
// 실행: npm run ingest:stores (GitHub Actions sync-data.yml에서 매일 1회 자동 실행)
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { normalizeAddress } from "./lib/addressNormalizer";
import { geocodeAddress, reverseGeocodeDongCode } from "./lib/vworldGeo";
import { cascadingMatch } from "./lib/cascadingMatcher";
import { buildStoreId } from "./lib/storeId";
import { getPrizeStoresFromSeed } from "./lib/seedData";

const VWORLD_API_KEY = process.env.VWORLD_API_KEY;
const BATCH_SIZE = 50;

interface RawStore {
  name: string;
  address: string;
  phoneNumber?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  storeType?: string | null;
  externalId?: string;
}

async function fetchStoreList(): Promise<RawStore[]> {
  // 현재 구현: 시드 데이터에서 로드 (테스트/개발용)
  // 향후 업그레이드: CSV 파일 읽기, 공공데이터포털 API, Playwright 크롤링

  console.log("📦 판매점 데이터 소스 확인...");

  // 1단계: 시드 데이터 확인
  try {
    // 모든 회차의 당첨점을 시드 데이터에서 수집하여 기본 판매점 목록 생성
    const seedStores: Record<string, RawStore> = {};

    // 시드 데이터에서 주요 당첨점들 추출
    for (let drwNo = 1100; drwNo <= 1130; drwNo++) {
      const firstPrizeStores = getPrizeStoresFromSeed(drwNo, 1);
      const secondPrizeStores = getPrizeStoresFromSeed(drwNo, 2);

      [...firstPrizeStores, ...secondPrizeStores].forEach((store) => {
        if (!seedStores[store.address]) {
          seedStores[store.address] = {
            name: store.name,
            address: store.address,
            latitude: store.latitude,
            longitude: store.longitude,
          };
        }
      });
    }

    const stores = Object.values(seedStores);
    console.log(`✅ 시드 데이터에서 ${stores.length}개 판매점 로드`);
    return stores;
  } catch (error) {
    console.warn(`⚠️  시드 데이터 로드 실패: ${error instanceof Error ? error.message : String(error)}`);

    // 폴백: 기본 테스트 데이터
    console.log("📋 기본 테스트 데이터로 진행합니다.");
    return [
      {
        name: "CU편의점 강남역점",
        address: "서울특별시 강남구 테헤란로 68",
        latitude: 37.4979,
        longitude: 127.0276,
      },
      {
        name: "이마트 성내점",
        address: "서울특별시 강동구 성내동 406",
        latitude: 37.5421,
        longitude: 127.128,
      },
      {
        name: "GS25 명동점",
        address: "서울특별시 중구 명동길 8",
        latitude: 37.5631,
        longitude: 126.9826,
      },
    ];
  }
}

async function processStore(raw: RawStore, index: number): Promise<{ success: boolean; reason?: string }> {
  try {
    if (!raw.address) {
      return { success: false, reason: "주소 정보 없음" };
    }

    const normalized = normalizeAddress(raw.address);

    // 1단계: 좌표 확보 (기존 좌표 또는 지오코딩)
    let coords = raw.latitude != null && raw.longitude != null
      ? { latitude: raw.latitude, longitude: raw.longitude }
      : null;

    if (!coords) {
      console.log(`  🔍 지오코딩: ${raw.name} (${raw.address})`);
      coords = await geocodeAddress(normalized.normalized);
      if (!coords) {
        return { success: false, reason: "지오코딩 실패" };
      }
    }

    // 2단계: 행정동코드 역지오코딩
    if (!VWORLD_API_KEY) {
      return { success: false, reason: "VWORLD_API_KEY 미설정" };
    }

    const addressInfo = await reverseGeocodeDongCode(coords);
    if (!addressInfo) {
      return { success: false, reason: "역지오코딩 실패" };
    }

    const dongCode = addressInfo.dongCode;

    // 3단계: 건물 본번 확인
    if (normalized.buildingMain == null) {
      return { success: false, reason: "본번 정보 없음" };
    }

    // 4단계: Cascading Match (중복 방지)
    const matchedId = await cascadingMatch({
      name: raw.name,
      latitude: coords.latitude,
      longitude: coords.longitude,
      buildingMain: normalized.buildingMain,
      buildingSub: normalized.buildingSub,
    });

    // 5단계: store_id 결정
    const storeId =
      matchedId ??
      buildStoreId({
        dongCode,
        buildingMain: normalized.buildingMain,
        buildingSub: normalized.buildingSub ?? 0,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });

    // 6단계: DB upsert
    const { error } = await supabaseAdmin.from("stores").upsert({
      id: storeId,
      external_id: raw.externalId,
      name: raw.name,
      store_type: raw.storeType,
      address: normalized.normalized,
      sido: normalized.sido,
      sigungu: normalized.sigungu,
      phone: raw.phoneNumber,
      latitude: coords.latitude,
      longitude: coords.longitude,
      dong_code: dongCode,
      building_main: normalized.buildingMain,
      building_sub: normalized.buildingSub ?? 0,
    });

    if (error) {
      return { success: false, reason: `DB 오류: ${error.message}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      reason: `처리 오류: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function main() {
  console.log("🚀 로또 판매점 데이터 수집 시작...");
  console.log(`데이터 소스: 시드 데이터 + V-World API (지오코딩/역지오코딩)`);
  console.log(`V-World API Key 설정: ${VWORLD_API_KEY ? "✅" : "❌"}`);
  console.log("");

  let totalUpserted = 0;
  let totalSkipped = 0;

  try {
    console.log("📦 판매점 목록 로드 중...");
    const stores = await fetchStoreList();

    if (stores.length === 0) {
      console.log("❌ 판매점 데이터를 찾을 수 없습니다.");
      process.exit(1);
    }

    console.log(`✅ ${stores.length}개 판매점 로드됨\n`);
    console.log("📍 각 판매점 처리 중...");

    const results = await Promise.all(stores.map((store, idx) => processStore(store, idx)));

    const upserted = results.filter((r) => r.success).length;
    const skipped = results.filter((r) => !r.success).length;

    totalUpserted = upserted;
    totalSkipped = skipped;

    console.log("");
    console.log("✅ 완료!");
    console.log(`   총 저장: ${totalUpserted}건`);
    console.log(`   총 스킵: ${totalSkipped}건`);

    if (skipped > 0) {
      console.log("\n⚠️  스킵된 항목:");
      results.forEach((result, idx) => {
        if (!result.success) {
          console.log(`   - ${stores[idx].name}: ${result.reason}`);
        }
      });
    }
  } catch (error) {
    console.error("❌ 배치 실행 실패:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
