// 기본 지도 중심 좌표: 서울시청
export const DEFAULT_MAP_CENTER = { latitude: 37.5665, longitude: 126.978 };

// GPS 기반 주변 판매점 검색 기본 반경 (m)
export const DEFAULT_SEARCH_RADIUS_M = 3000;

// 명당 알림: 진입 감지 반경 (m). 차량 이동 중에도 GPS 오차/속도로 인해 반경을 짧게 지나쳐버려
// 알림이 안정적으로 작동하지 않는 문제가 있어 300m → 500m로 확대했다.
export const GEOFENCE_RADIUS_M = 500;

// 명당 알림: 동시 모니터링 가능한 최대 판매점 수 (iOS 지오펜스 동시 등록 한도 20개) -
// 이 값 자체는 OS 하드리밋이라 건드리지 않는다. 유료회원 한도를 나중에 붙이면 이 값을 쓴다.
export const GEOFENCE_MAX_REGIONS = 20;

// 명당 알림: 무료회원 현재 선택 한도. 유료화 전까지는 이 값이 실제 적용 한도이고,
// 나중에 유료회원 여부를 확인할 수 있게 되면 GEOFENCE_MAX_REGIONS(20)로 풀어줄 예정.
export const GEOFENCE_FREE_TIER_MAX = GEOFENCE_MAX_REGIONS;

// 관리자 페이지 접근 허용 이메일 목록. 서버 측 권한 체크가 아니라 클라이언트 UI 게이팅이므로
// (이 앱에 별도 관리자 서버가 없음) 관리자 화면이 보여주는 데이터 자체가 공개 테이블 집계치
// 수준으로 민감하지 않은 것을 전제로 한다. 관리자를 추가/변경하려면 이 배열만 수정하면 된다.
export const ADMIN_EMAILS = ["bjgb1004@gmail.com"];

// GitHub 저장소가 private라 GitHub Pages/raw.githubusercontent.com은 외부에서 접근 불가 -
// 이미 쓰고 있는 Supabase Storage(공개 버킷)로 서빙한다(추가 비용/서비스 없이 해결).
export const PRIVACY_POLICY_URL = "https://kpjpemkojykuqzhddsjl.supabase.co/storage/v1/object/public/legal/privacy-policy.html";
export const TERMS_OF_SERVICE_URL = "https://kpjpemkojykuqzhddsjl.supabase.co/storage/v1/object/public/legal/terms-of-service.html";
