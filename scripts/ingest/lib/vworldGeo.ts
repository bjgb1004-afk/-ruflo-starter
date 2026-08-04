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
    const params = new URLSearchParams({
      service: "address",
      request: "getcoord",
      version: "2.0",
      crs: "epsg:4326",
      address: address,
      format: "json",
      key: VWORLD_API_KEY,
    });

    const res = await fetch(`${url}?${params}`);
    const json = (await res.json()) as any;

    const record = json.response?.record?.[0];
    if (!record?.point?.x || !record?.point?.y) {
      return null;
    }

    return {
      latitude: record.point.y,
      longitude: record.point.x,
    };
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
      format: "json",
      key: VWORLD_API_KEY,
    });

    const res = await fetch(`${url}?${params}`);
    const json = (await res.json()) as any;

    const item = json.response?.result?.items?.[0];
    if (!item?.address || !item?.admCd) {
      return null;
    }

    return {
      address: item.address,
      dongCode: item.admCd,
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
