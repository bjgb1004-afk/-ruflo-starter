import Constants from "expo-constants";

export const NAVER_MAP_CLIENT_ID = Constants.expoConfig?.extra?.naverMapClientId as
  | string
  | undefined;

// 기본 지도 중심 좌표: 서울시청
export const DEFAULT_MAP_CENTER = { latitude: 37.5665, longitude: 126.978 };

// GPS 기반 주변 판매점 검색 기본 반경 (m)
export const DEFAULT_SEARCH_RADIUS_M = 3000;

// 명당 알림: 진입 감지 반경 (m)
export const GEOFENCE_RADIUS_M = 300;

// 명당 알림: 동시 모니터링 가능한 최대 판매점 수 (iOS 지오펜스 동시 등록 한도 20개)
export const GEOFENCE_MAX_REGIONS = 20;
