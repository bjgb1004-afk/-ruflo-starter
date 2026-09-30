// 일회성 수동 정정 스크립트. 2026-09-30 "흥부네" 데이터 감사 결과 반영.
// 완료 후 이 파일과 .github/workflows/adhoc-fix.yml은 삭제한다.
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { normalizeAddress } from "./lib/addressNormalizer";
import { geocodeAddress, reverseGeocodeDongCode } from "./lib/vworldGeo";

const GARBAGE_IDS = [
  "5966e79d-6724-5558-9f88-41052d8d11d7", // 흥부네대박났네 (역동27-28) - 네이버 미검색, external_id 없음
  "611f31cc-3e46-5403-bb4f-3894663464c2", // 흥부네대박났네 (경충대로763) - 위와 동일 사유
  "533c2ed7-829a-404a-b6fa-55861b29f1fe", // 흥부네대박 (광여로713 좌측1벌) - 행복을 드립니다(eefedcbd)와 4m 중복
];

const HAENGBOK_ID = "890ffbee-7e61-4f55-bc1e-51ac546854df"; // 행복한사람들 (흥부네)
const CORRECT_ADDRESS = "경기도 광주시 초월읍 경충대로 1014";

async function main() {
  console.log("1) 쓰레기/중복 레코드 삭제...");
  const { error: delError, count } = await supabaseAdmin
    .from("stores")
    .delete({ count: "exact" })
    .in("id", GARBAGE_IDS);
  if (delError) throw delError;
  console.log(`   삭제 ${count}건`);

  console.log("2) 행복한사람들(흥부네) 주소 재지오코딩...");
  const normalized = normalizeAddress(CORRECT_ADDRESS);
  const coords = await geocodeAddress(normalized.normalized);
  if (!coords) throw new Error(`지오코딩 실패: ${normalized.normalized}`);
  console.log("   좌표:", coords);

  const reverse = await reverseGeocodeDongCode(coords);
  console.log("   역지오코딩(법정동코드):", reverse);

  const { error: updError } = await supabaseAdmin
    .from("stores")
    .update({
      address: normalized.normalized,
      road_address: normalized.normalized,
      sido: normalized.sido,
      sigungu: normalized.sigungu,
      building_main: normalized.buildingMain,
      building_sub: normalized.buildingSub ?? 0,
      latitude: coords.latitude,
      longitude: coords.longitude,
      dong_code: reverse?.dongCode ?? null,
    })
    .eq("id", HAENGBOK_ID);
  if (updError) throw updError;

  console.log("완료.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
