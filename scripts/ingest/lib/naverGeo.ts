// 네이버 클라우드 플랫폼(NCP) Geocoding / Reverse Geocoding 래퍼.
// 배치(서버) 전용 자격증명(NAVER_MAP_CLIENT_ID/NAVER_MAP_CLIENT_SECRET)을 사용한다.
// NAVER_MAP_CLIENT_ID는 앱의 EXPO_PUBLIC_NAVER_MAP_CLIENT_ID와 동일한 NCP Client ID.

const NAVER_MAP_CLIENT_ID = process.env.NAVER_MAP_CLIENT_ID;
const NAVER_MAP_CLIENT_SECRET = process.env.NAVER_MAP_CLIENT_SECRET;

function ncpHeaders() {
  if (!NAVER_MAP_CLIENT_ID || !NAVER_MAP_CLIENT_SECRET) {
    throw new Error("NAVER_MAP_CLIENT_ID / NAVER_MAP_CLIENT_SECRET 환경변수가 필요합니다.");
  }
  return {
    "X-NCP-APIGW-API-KEY-ID": NAVER_MAP_CLIENT_ID,
    "X-NCP-APIGW-API-KEY": NAVER_MAP_CLIENT_SECRET,
  };
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** 정규화된 주소 문자열 -> 좌표. 공공데이터에 좌표가 없는 판매점 보완용. */
export async function geocodeAddress(normalizedAddress: string): Promise<Coordinates | null> {
  const url = `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(normalizedAddress)}`;
  const res = await fetch(url, { headers: ncpHeaders() });
  const json = await res.json();
  const first = json.addresses?.[0];
  if (!first) return null;

  return { latitude: Number(first.y), longitude: Number(first.x) };
}

/**
 * 좌표 -> 행정동/법정동 코드.
 * TODO: 실제 응답 필드(`region.area0~area3.code`)는 NCP 콘솔에서 발급받은 키로
 * 최종 검증 필요. 네이버 리버스 지오코딩 API 정책/응답 스키마 변경 가능성이 있으므로
 * 프로덕션 반영 전 실제 응답 샘플로 검증할 것.
 */
export async function reverseGeocodeDongCode(coords: Coordinates): Promise<string | null> {
  const url = `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${coords.longitude},${coords.latitude}&orders=legalcode&output=json`;
  const res = await fetch(url, { headers: ncpHeaders() });
  const json = await res.json();
  const region = json.results?.[0]?.region;
  if (!region) return null;

  // area0(국가) ~ area3(법정동) 코드를 이어붙여 법정동코드를 구성한다.
  return [region.area0, region.area1, region.area2, region.area3]
    .map((area: { code?: string } | undefined) => area?.code ?? "")
    .join("");
}
