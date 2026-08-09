// 기본 지도 중심 좌표: 서울시청
export const DEFAULT_MAP_CENTER = { latitude: 37.5665, longitude: 126.978 };

// GPS 기반 주변 판매점 검색 기본 반경 (m)
export const DEFAULT_SEARCH_RADIUS_M = 3000;

// 명당 알림: 진입 감지 반경 (m). 차량 이동 중에도 GPS 오차/속도로 인해 반경을 짧게 지나쳐버려
// 알림이 안정적으로 작동하지 않는 문제가 있어 300m → 500m로 확대했다.
export const GEOFENCE_RADIUS_M = 500;

// 명당 알림: 동시 모니터링 가능한 최대 판매점 수 (iOS 지오펜스 동시 등록 한도 20개)
export const GEOFENCE_MAX_REGIONS = 20;

// 관리자 페이지 접근 허용 이메일 목록. 서버 측 권한 체크가 아니라 클라이언트 UI 게이팅이므로
// (이 앱에 별도 관리자 서버가 없음) 관리자 화면이 보여주는 데이터 자체가 공개 테이블 집계치
// 수준으로 민감하지 않은 것을 전제로 한다. 관리자를 추가/변경하려면 이 배열만 수정하면 된다.
export const ADMIN_EMAILS = ["bjgb1004@gmail.com"];

export const PRIVACY_POLICY_URL = "https://bjgb1004-afk.github.io/-ruflo-starter/privacy-policy.html";
