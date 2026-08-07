# 전국 로또 지도 통계 플랫폼

국내 로또(동행복권) 판매점 위치, 1·2등 당첨 이력, GPS 기반 반경 검색, 스마트 추천 점수(`store_score`) 기반 명당 랭킹을 제공하는 Android/iOS 앱.
초기 비용 0원(100% 무료 티어), 공공데이터 기반 법적 안전성을 전제로 설계되었습니다.

## 확정 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 앱 프레임워크 | React Native + Expo (Expo Router, TypeScript) | Android/iOS 단일 코드베이스, EAS 무료 티어로 빌드/배포 |
| 지도 | 네이버 지도 SDK (`@react-native-seoul/naver-map`) | 월 300만 건 무료 쿼터, 국내 서비스에 최적화 |
| 백엔드/DB | Supabase (PostgreSQL + PostGIS) | 무료 티어로 운영, PostGIS로 GPS 반경 검색 |
| 상태 관리 | TanStack Query (서버 캐싱) + Zustand (클라이언트 전역 상태) | 지역 필터, 검색 반경 등 |
| 위치/GPS | expo-location | 주변 판매점 검색 |
| 데이터 배치 | GitHub Actions (cron, 매일 1회) | 동행복권 API + 공공데이터포털 자동 수집, 주소 정규화/매칭/랭킹 재계산 파이프라인 |
| 모니터링/분석 | Sentry (에러 추적) + PostHog (사용자 통계) | 각 무료 티어 사용, DSN/키 미설정 시 자동 비활성화 |
| 보안/도메인 | Cloudflare | 도메인 DNS 및 기본 WAF/DDoS 방어 (인프라 레벨 설정, 앱 저장소에는 별도 코드 없음) |

## 데이터 수집 및 식별 알고리즘

서로 다른 두 데이터 소스(동행복권 발표 텍스트, 공공데이터포털 주소)가 같은 판매점을 다르게 표기하는 문제와,
상호명이 바뀌어도 매장 정체성을 유지해야 하는 문제를 해결하기 위해 아래 파이프라인을 둔다. (`scripts/ingest/lib/`)

### 1) 위치 기반 고유 식별자 (`store_id`) — `lib/storeId.ts`

`stores.id`는 DB가 생성하지 않고 배치가 결정론적으로 계산해 공급한다.

```
store_id = UUIDv5( SHA-1 입력 = 행정동코드 + 본번-부번 + 소수점 4자리 좌표, Namespace )
```

브랜드/상호가 바뀌어도 물리적 입지(행정동 + 지번 + 좌표)가 유지되면 항상 동일한 `store_id`가 재생성되므로, `draw_history`의 배출 이력이 끊기지 않는다. 네임스페이스 UUID는 코드에 고정 상수로 박혀 있으며 **절대 변경 금지**(변경 시 기존 매장 식별자가 전부 달라짐).

### 2) 주소 정규화 모듈 — `lib/addressNormalizer.ts`

동행복권 텍스트와 공공데이터포털 주소 표기 격차를 Geocoding 이전에 해소한다.

- 광역시도 축약형 → 정식 명칭 통일 (`서울` → `서울특별시`, `경기` → `경기도` 등)
- 불용어 제거: 층수(`3층`), 호수(`101호`), 괄호 안 부가 설명, 구분 특수문자
- 공백/특수문자 정규화 및 도로명·지번 끝의 본번·부번(`123-4` 등) 추출

### 3) 단계적 반경/유사도 매칭 (Cascading Match) — `lib/cascadingMatcher.ts`, `lib/similarity.ts`

정규화된 주소·좌표로도 완전히 같은 문자열이 되지 않는 경우(발표 텍스트 vs 원본 주소, 재수집 시 좌표 미세 변동)를 대비한 안전망. `stores_within_radius()` RPC로 후보를 조회한 뒤 단계적으로 판정한다.

| 단계 | 반경 | 판정 기준 |
|---|---|---|
| 1단계 | 20m 이내 | 상호 유사도(Levenshtein 기반) 60% 이상 → 즉시 매칭 |
| 2단계 | 50m 이내 | 상호 유사도 80% 이상 → 매칭 |
| 3단계 | 100m 이내 | 건물 본번/부번 완전 일치 → 매칭 |

`fetchStores.ts`는 좌표 미세 변동으로 인한 중복 매장 생성을 막는 데, `fetchDrawHistory.ts`는 배출점 발표 텍스트를 기존 `stores` 레코드에 연결하는 데 이 매칭을 사용한다.

### 4) 스마트 추천 점수 (`store_score` / `recommend_score`)

```
store_score(정적, 배치가 저장)   = 최근 1년 1등 수 * 50 + 최근 1년 2등 수 * 10 + 누적 1등 수 * 5
recommend_score(조회 시점 계산) = store_score - 현재 거리(km) * 15
```

`store_score`는 거리와 무관해 `store_ranking_stats`에 배치로 저장되고, `recommend_score`는 사용자의 실시간 위치를 반영해야 하므로 `nearby_stores()` SQL 함수가 조회 시점에 계산한다. 내비게이션/이동 경로 추천 모드는 `recommend_score` 내림차순 결과를 그대로 사용하면 된다.

## 데이터 출처 (공공데이터, 무료)

- **당첨 번호/통계**: 동행복권 공개 API (`https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=`) — 별도 인증키 불필요
- **판매점 위치**: 공공데이터포털(data.go.kr) "복권 판매점 현황" 오픈API — 무료 API 키 필요 (`DATA_GO_KR_API_KEY`)
- **주소 → 좌표 / 좌표 → 행정동코드**: 네이버 클라우드 플랫폼 Geocoding·Reverse Geocoding (무료 쿼터, `NAVER_MAP_CLIENT_ID`/`NAVER_MAP_CLIENT_SECRET`)
- **1·2등 배출 매장 매칭**: `fetchDrawHistory.ts`의 `fetchPrizeStoreAnnouncements()`는 현재 자리표시자(stub)다. 동행복권이 이를 안정적인 공개 API가 아닌 웹페이지로만 제공해, 이용약관 확인 및 실제 페이지 구조 검증 전에는 스크래핑 로직을 고정할 수 없기 때문 — 아래 [제약사항](#제약사항) 참고

## 폴더 구조

```
.
├── app/                            # Expo Router (파일 기반 라우팅)
│   ├── _layout.tsx                 # 루트 레이아웃 (QueryClientProvider, Sentry/PostHog 초기화)
│   ├── (tabs)/
│   │   ├── _layout.tsx             # 하단 탭 (지도 / 명당 랭킹 / 지역 통계)
│   │   ├── index.tsx               # 지도 홈 (GPS 기반 주변 판매점, 스마트 추천 정렬)
│   │   ├── ranking.tsx             # 전국 명당 랭킹 (nation_rank 순)
│   │   └── stats.tsx               # 회차/지역 통계
│   └── store/[id].tsx              # 판매점 상세 (당첨 이력)
├── src/
│   ├── lib/
│   │   ├── supabase.ts             # Supabase 클라이언트 (anon key, 클라이언트 전용)
│   │   ├── sentry.ts               # Sentry 초기화
│   │   └── analytics.ts            # PostHog 초기화 및 이벤트 트래킹
│   ├── types/database.types.ts     # DB 스키마와 매핑되는 TS 타입
│   ├── constants/config.ts         # 지도 클라이언트 ID, 기본 좌표/반경 등 상수
│   ├── store/useAppStore.ts        # Zustand 전역 상태 (선택 지역, 검색 반경)
│   ├── hooks/useCurrentLocation.ts # expo-location 래퍼 훅
│   └── features/
│       ├── map/
│       │   ├── components/StoreMapView.tsx   # 지도 래퍼 (Android: Google Maps, iOS: Apple Maps)
│       │   └── hooks/useNearbyStores.ts       # nearby_stores RPC 훅
│       ├── stores/api/storesApi.ts            # 판매점 조회/랭킹 API
│       └── draws/api/drawHistoryApi.ts        # 회차/당첨 이력 API
├── scripts/ingest/                 # 데이터 적재 배치 (Node/TS, GitHub Actions에서 실행)
│   ├── lib/
│   │   ├── supabaseAdmin.ts        # service_role 키 사용 (서버 전용)
│   │   ├── addressNormalizer.ts    # 주소 정규화 모듈
│   │   ├── similarity.ts           # 상호명 유사도 (Levenshtein)
│   │   ├── storeId.ts              # UUID v5 결정론적 store_id 생성
│   │   ├── naverGeo.ts             # 네이버 Geocoding/Reverse Geocoding 래퍼
│   │   └── cascadingMatcher.ts     # 단계적 반경/유사도 매칭 (Cascading Match)
│   ├── fetchStores.ts              # 공공데이터포털 판매점 수집 → 정규화·매칭·UUID v5 → stores upsert
│   ├── fetchDrawHistory.ts         # 동행복권 회차 수집 + 배출점 매칭 → draw_history upsert
│   └── refreshRankingStats.ts      # store_ranking_stats 재계산 (refresh_store_ranking_stats() 호출)
├── supabase/
│   ├── config.toml
│   ├── migrations/20260803000000_init_schema.sql  # PostGIS + stores + draw_history + store_ranking_stats(물리 테이블) 초기 마이그레이션
│   └── seed.sql                    # 로컬 개발용 샘플 데이터
└── .github/workflows/
    ├── ci.yml                      # lint/typecheck/test
    └── sync-data.yml               # 매일 1회 데이터 적재 배치 실행 (stores → draws → 랭킹 재계산 순)
```

## DB 스키마 요약 (`supabase/migrations/20260803000000_init_schema.sql`)

- **PostGIS 확장 활성화**: `stores.location`(geography)에 GiST 인덱스를 걸어 GPS 반경 검색·매칭을 지원
- **`stores`**: 판매점 위치 정보. `id`는 배치가 공급하는 결정론적 UUID v5, `dong_code`/`building_main`/`building_sub`는 식별자 생성 및 Cascading Match 3단계에 사용
- **`draw_history`**: 회차별 당첨 번호·판매 통계와 1등/2등 배출 판매점(`stores.id` 배열)을 함께 관리
- **`store_ranking_stats`** (물리 테이블, View 아님): 조회 성능을 위해 `refresh_store_ranking_stats()`가 배치 실행마다 전체 UPSERT/재계산. 누적·최근 1/5년 배출 수, `store_score`, 전국/시도/시군구 순위(`nation_rank`/`province_rank`/`city_rank`) 보유
- **`refresh_store_ranking_stats()`** (함수): `draw_history`를 집계해 `store_ranking_stats`를 갱신하고 순위를 재계산 — 수집 배치의 마지막 단계
- **`stores_within_radius(lat, lng, radius_m)`** (함수): Cascading Match 전용 반경 검색 후보 조회
- **`nearby_stores(lat, lng, radius_m, max_results)`** (함수): 반경 내 판매점을 `recommend_score`(스마트 추천) 순으로 반환하며 `distance_m`도 함께 제공해 거리순 재정렬 가능 → 지도 화면에서 바로 사용
- **RLS**: 모든 테이블 읽기(SELECT)는 공개, 쓰기는 GitHub Actions 배치의 `service_role` 키로만 수행

## 시작하기

```bash
npm install
cp .env.example .env   # 값 채우기
npx expo install --fix # Expo SDK 버전에 맞게 네이티브 의존성 정렬
npm start
```

### Supabase 초기화

```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase db push   # supabase/migrations 적용
npx supabase db seed   # (선택) 샘플 데이터 삽입 + store_ranking_stats 초기 계산
```

### 환경 변수 (`.env`)

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`: 앱 클라이언트용 (공개 가능한 anon key)
- `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID`: 네이버 지도 SDK 클라이언트 ID (앱 번들 포함)
- `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_API_KEY`: 미설정 시 각 초기화 코드가 조용히 비활성화됨
- `SUPABASE_SERVICE_ROLE_KEY`, `DATA_GO_KR_API_KEY`: 서버/배치 전용
- `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET`: 서버 배치의 Geocoding/Reverse Geocoding 자격증명. `NAVER_MAP_CLIENT_ID`는 `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID`와 동일한 NCP Client ID 값을 사용해도 무방하나, Secret은 앱에 절대 포함하지 않음

> 서버/배치 전용 값은 GitHub Actions Secret으로만 보관하고 앱 번들/커밋에 포함하지 않는다.

### 데이터 적재 배치

`.github/workflows/sync-data.yml`이 매일 03:00(KST)에 아래 순서로 실행한다 (판매점을 먼저 갱신해야 배출점 매칭 대상이 최신 상태가 됨).

```bash
npm run ingest:stores            # 1. 판매점 수집 (정규화 → 매칭/UUID v5 → upsert)
npm run ingest:draws             # 2. 회차 + 배출점 매칭 수집
npm run ingest:refresh-rankings  # 3. store_ranking_stats 재계산 (순위/store_score)
```

## 운영/보안

- **Cloudflare**: 서비스 도메인의 DNS 및 기본 WAF/DDoS 방어에 사용 (Cloudflare 대시보드에서 설정하는 인프라 레벨 구성이며 앱 저장소 내 별도 코드는 없음)
- **Sentry / PostHog**: 각 무료 티어 한도 내에서 에러 추적 및 사용자 통계 수집

## 제약사항

- **1·2등 배출점 매칭 데이터 소스 미확정**: 동행복권은 배출점 명단을 안정적인 공개 API가 아닌 웹페이지로만 제공한다. `fetchDrawHistory.ts`의 `fetchPrizeStoreAnnouncements()`는 현재 빈 배열을 반환하는 자리표시자이며, 실제 페이지 구조 확인·이용약관 검토 후 파싱 로직을 구현하거나 대체 공공데이터 소스로 교체해야 `draw_history`의 배출점 배열과 `store_score`가 채워진다.
- **역지오코딩 응답 스키마 미검증**: `naverGeo.ts`의 `reverseGeocodeDongCode()`는 NCP 콘솔에서 발급받은 실제 키로 응답 구조(`region.area0~area3.code`)를 검증한 뒤 사용해야 한다.

## 향후 고려사항

- `store_ranking_stats`는 데이터량이 커지면 배치 UPSERT 대신 증분 갱신(변경된 매장만 재계산) 최적화 검토
- EAS Build 무료 티어 빌드 횟수 초과 시 로컬 빌드(`eas build --local`)로 대체
