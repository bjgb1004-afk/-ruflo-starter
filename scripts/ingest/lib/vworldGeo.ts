/**
 * V-World (브이월드) API 래퍼
 * 국토교통부 국가공간정보포털 - 지오코딩/역지오코딩
 *
 * 참고: https://www.vworld.kr/
 * API 문서: https://www.vworld.kr/dev/v4api.do
 */

const VWORLD_API_KEY = process.env.VWORLD_API_KEY;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface AddressInfo {
  address: string;
  dongCode: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch + JSON 파싱을 재시도(지수 백오프)와 함께 수행.
 * VWorld가 순간적으로 과도한 요청을 받으면 커넥션을 끊거나(fetch failed)
 * HTML 오류 페이지를 반환(JSON 파싱 실패)하는데, 둘 다 일시적 현상이라 재시도로 해결됨.
 */
async function fetchJsonWithRetry(url: string, retries = 3): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(300 * attempt);
    }
    try {
      const res = await fetch(url);
      const text = await res.text();
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * 주소 → 좌표 변환 (지오코딩)
 */
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  if (!VWORLD_API_KEY) {
    console.warn("VWORLD_API_KEY 환경변수가 필요합니다.");
    return null;
  }

  try {
    const url = "https://api.vworld.kr/req/address";

    // 도로명(road) 주소로 먼저 시도하고, 실패하면 지번(parcel)으로 재시도
    for (const addressType of ["road", "parcel"] as const) {
      const params = new URLSearchParams({
        service: "address",
        request: "getcoord",
        version: "2.0",
        crs: "epsg:4326",
        address: address,
        type: addressType,
        format: "json",
        key: VWORLD_API_KEY,
      });

      const json = await fetchJsonWithRetry(`${url}?${params}`);

      // 성공 시: response.result.point.{x,y}
      // 실패 시: response.record.{total,current} (point 없음)
      const point = json.response?.result?.point;
      if (json.response?.status === "OK" && point?.x && point?.y) {
        return {
          latitude: parseFloat(point.y),
          longitude: parseFloat(point.x),
        };
      }
    }

    return null;
  } catch (error) {
    console.warn(`지오코딩 실패 (${address}): ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * 좌표 → 주소 및 행정동코드 변환 (역지오코딩)
 */
export async function reverseGeocodeDongCode(coords: Coordinates): Promise<AddressInfo | null> {
  if (!VWORLD_API_KEY) {
    console.warn("VWORLD_API_KEY 환경변수가 필요합니다.");
    return null;
  }

  try {
    const url = "https://api.vworld.kr/req/address";
    const params = new URLSearchParams({
      service: "address",
      request: "getaddress",
      version: "2.0",
      crs: "epsg:4326",
      point: `${coords.longitude},${coords.latitude}`,
      type: "road",
      format: "json",
      key: VWORLD_API_KEY,
    });

    const json = await fetchJsonWithRetry(`${url}?${params}`);

    const item = json.response?.result?.[0];
    if (!item?.text || !item?.structure?.level4AC) {
      return null;
    }

    return {
      address: item.text,
      dongCode: item.structure.level4AC,
    };
  } catch (error) {
    console.warn(`역지오코딩 실패: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * V-World API 상태 확인
 */
export async function checkVWorldApiStatus(): Promise<boolean> {
  if (!VWORLD_API_KEY) {
    console.warn("VWORLD_API_KEY 환경변수가 없습니다.");
    return false;
  }

  try {
    const testAddress = "서울특별시 강남구 테헤란로 1";
    const result = await geocodeAddress(testAddress);
    return result !== null;
  } catch {
    return false;
  }
}
