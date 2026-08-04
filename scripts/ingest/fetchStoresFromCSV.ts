// CSV 파일에서 판매점 데이터를 읽어 Supabase에 저장하는 배치 스크립트
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { normalizeAddress } from "./lib/addressNormalizer";
import { buildStoreId } from "./lib/storeId";
import { cascadingMatch } from "./lib/cascadingMatcher";

const STORES_CSV = "C:\\Users\\pc\\Downloads\\기획예산처_온라인복권 판매점 주소_20250607.csv";

interface CSVStore {
  번호: string;
  상호: string;
  도로명주소: string;
  지번주소: string;
}

function parseCSV(content: string): CSVStore[] {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim());

  const stores: CSVStore[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = line.split(",").map((v) => v.trim());
    if (values.length < headers.length) continue;

    const store: any = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = values[j] || "";
      store[header] = value;
    }
    stores.push(store);
  }

  console.log(`📋 CSV 파싱 완료: 헤더 ${headers.length}개, 데이터 ${stores.length}개`);
  console.log(`   헤더: ${headers.join(", ")}`);
  if (stores.length > 0) {
    console.log(`   샘플: ${stores[0].상호} | ${stores[0].도로명주소}`);
  }
  console.log("");

  return stores;
}

async function processStore(
  store: CSVStore,
  index: number,
): Promise<{ success: boolean; reason?: string }> {
  try {
    const rawAddress = store.도로명주소 || store.지번주소;
    if (!rawAddress) {
      if (index < 3) console.log(`[${index}] ❌ 주소 없음: ${store.상호}`);
      return { success: false, reason: "주소 정보 없음" };
    }

    const normalized = normalizeAddress(rawAddress);
    if (index < 3) console.log(`[${index}] ℹ️  ${store.상호}: ${normalized.normalized}`);

    // 임시로 UUID v4를 사용 (실제로는 UUID v5 결정론적 생성)
    const store_id = uuidv4();

    const { error } = await supabaseAdmin.from("stores").insert([{
      id: store_id, // 임시 UUID v4
      external_id: store.번호,
      name: store.상호,
      address: normalized.normalized,
      road_address: store.도로명주소,
      sido: normalized.sido,
      sigungu: normalized.sigungu,
      latitude: 37.5, // 플레이스홀더 (나중에 좌표 배치로 업데이트)
      longitude: 126.9, // 플레이스홀더
      building_main: normalized.buildingMain,
      building_sub: normalized.buildingSub ?? 0,
      is_active: true,
    }]);

    if (error) {
      // 첫 5개 오류만 상세히 출력
      if (index < 5) {
        console.error(`  ❌ ${store.상호} (${index}):`, {
          code: (error as any).code,
          message: error.message,
          details: (error as any).details,
        });
      }
      return { success: false, reason: error.message };
    }

    // 첫 5개만 성공 로그
    if (index < 5) {
      console.log(`  ✅ ${store.상호} (${store_id})`);
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
  console.log("🚀 CSV 파일에서 로또 판매점 데이터 수집 시작...");
  console.log(`📄 파일: ${STORES_CSV}`);
  console.log("");

  try {
    // CSV 파일 읽기 (CP949 인코딩)
    const content = fs.readFileSync(STORES_CSV, "utf-8");
    const stores = parseCSV(content);

    console.log(`📊 총 ${stores.length}개의 판매점 데이터 발견`);
    console.log("");

    let upserted = 0;
    let skipped = 0;

    // 배치 처리 (100개씩)
    const batchSize = 100;
    for (let i = 0; i < stores.length; i += batchSize) {
      const batch = stores.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((store, idx) => processStore(store, i + idx)));

      const batchUpserted = results.filter((r) => r.success).length;
      const batchSkipped = results.filter((r) => !r.success).length;

      upserted += batchUpserted;
      skipped += batchSkipped;

      console.log(`  배치 ${Math.floor(i / batchSize) + 1}: ✅ ${batchUpserted}건 / ⏭️  ${batchSkipped}건`);
    }

    console.log("");
    console.log("✅ 완료!");
    console.log(`   총 저장: ${upserted}건`);
    console.log(`   총 스킵: ${skipped}건`);
    console.log("");
    console.log("⚠️  주의: 이 스크립트는 테스트용입니다.");
    console.log("   실제 프로덕션에서는 다음 단계가 필요합니다:");
    console.log("   1. Naver Geocoding으로 좌표 추출");
    console.log("   2. Reverse Geocoding으로 행정동코드 추출");
    console.log("   3. UUID v5 결정론적 생성");
    console.log("   4. Cascading Match로 중복 제거");
  } catch (error) {
    console.error("❌ 배치 실행 실패:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ 예상치 못한 오류:", err);
  process.exit(1);
});
