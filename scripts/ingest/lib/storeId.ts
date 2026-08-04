import { v5 as uuidv5 } from "uuid";

// 프로젝트 전용 네임스페이스 UUID. 절대 변경 금지 — 변경 시 기존에 생성된 모든
// store_id가 달라져 draw_history의 배출 매장 배열과의 연결이 끊어진다.
export const STORE_ID_NAMESPACE = "2f3f4d2a-6b9e-4c1a-8f27-2a5f2d7c9e10";

export interface StoreIdInput {
  /** 행정동/법정동 코드 */
  dongCode: string;
  /** 지번/도로명 본번 */
  buildingMain: number;
  /** 지번/도로명 부번 (없으면 0) */
  buildingSub: number;
  latitude: number;
  longitude: number;
}

/**
 * 위치 기반 고유 식별자(store_id) 생성.
 * SHA-1(Namespace + 행정동코드 + 본번-부번 + 소수점 4자리 좌표) 기반 UUID v5.
 * 상호명/주소 표기가 바뀌어도 물리적 입지(행정동 + 지번 + 좌표)가 유지되면
 * 동일한 store_id가 재생성되어 매장 정체성이 유지된다.
 */
export function buildStoreId({
  dongCode,
  buildingMain,
  buildingSub,
  latitude,
  longitude,
}: StoreIdInput): string {
  const lat4 = latitude.toFixed(4);
  const lng4 = longitude.toFixed(4);
  const key = `${dongCode}|${buildingMain}-${buildingSub}|${lat4},${lng4}`;
  return uuidv5(key, STORE_ID_NAMESPACE);
}
