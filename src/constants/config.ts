import Constants from "expo-constants";

export const NAVER_MAP_CLIENT_ID = Constants.expoConfig?.extra?.naverMapClientId as
  | string
  | undefined;

// 기본 지도 중심 좌표: 서울시청
export const DEFAULT_MAP_CENTER = { latitude: 37.5665, longitude: 126.978 };

// GPS 기반 주변 판매점 검색 기본 반경 (m)
export const DEFAULT_SEARCH_RADIUS_M = 3000;
