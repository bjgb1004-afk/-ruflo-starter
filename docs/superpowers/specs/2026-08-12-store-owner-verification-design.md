# 판매점 사장님 인증 및 정보 관리 기능 — 설계

- 날짜: 2026-08-12
- 상태: 설계 승인, 구현 대기 (2026-08-12 브레인스토밍으로 최종 확정 — OCR 방식 초안 폐기)

## 배경 / 목적

판매점 사장님이 본인 매장의 전화번호·영업시간·한마디 메시지를 직접 수정할 수 있게 한다.
"명당" 랭킹은 과거 당첨 이력으로 정해져 사장님이 바꿀 수 없지만, 이 정보는 사장님이
직접 신뢰도 있게 채워 넣을 수 있는 영역이다. ([[project_speeto_feature_research]]에서
논의된 "사장님 참여" 구조의 1단계 버전)

## 목표

- 사업자등록번호 등 정보를 사장님이 **직접 타이핑**해 제출하면, 국세청 API + 매장 DB
  대조로 매장 소유권을 검증해 권한을 부여한다.
- 권한을 가진 사장님이 전화번호·영업시간(자유 텍스트)·한마디를 수정할 수 있다.
- 소유권 충돌(재신청) 시 기존 사장님에게 7일간 이의제기 기회를 준 뒤 자동 이전한다.
- 신규 비용(OCR, SMS/ARS, Storage 등)을 최대한 배제한다.

## 비목표 (이번 범위 아님)

- 매장 사진 업로드 (추후 별도 설계)
- 전화(SMS/ARS) 본인 인증
- OCR 기반 사업자등록증 자동 판독 (타이핑 입력 + API 대조로 대체, 사진은 참고용
  선택 첨부만 허용하고 자동판단에는 쓰지 않음 — 미저장)
- 소유권 충돌이 아닌 일반 검증 실패에 대한 관리자 수동 심사 (재시도 안내만)
- 기존 일반회원 가입 절차 변경

## 사용자 흐름

### 1) 신규 인증

1. 로그인 화면에 "복권사장님으로 가입" 진입점 추가 (일반회원 가입과 완전히 분리)
2. 사장님 가입 화면: 이메일/비밀번호 + 본인 매장 검색·선택(기존 `stores` 레코드 중 하나를
   지정, 신규 매장 생성 아님) + **사업자등록번호/대표자명/개업일자를 직접 타이핑 입력**
   (+ 사업자등록증 사진은 참고용 선택 첨부, 자동판단에 미사용·비저장)
3. 제출 시 Edge Function (`verify-store-owner`)이:
   a. 국세청 "사업자등록정보 진위확인" API에 {사업자등록번호, 개업일자, 대표자성명} 조회
      → "계속사업자" 상태 확인
   b. 신청자가 선택한 `stores.name` / `stores.address`와 입력한 상호 정보 유사도 대조
   c. 둘 다 통과 → 승인. 하나라도 실패 → 거절 + 재시도 허용 + 실패 카운트 증가
4. **5회 연속 실패 시 24시간 재시도 잠금** (관리자 개입 없이 자동, 시간 지나면 자동 해제)
5. 해당 매장에 기존 승인된 사장님이 없으면 → 즉시 승인, `store_owner_profiles` 반영
6. 해당 매장에 이미 승인된 사장님(A)이 있으면 → **소유권 충돌 흐름**(아래)으로 진입

### 2) 소유권 충돌(재신청) 처리

기존 사장님(A)이 있는 매장에 새 신청자(B)가 검증을 통과해도 **즉시 이전하지 않는다**.

1. `store_ownership_transfer_requests`에 대기 레코드 생성 (7일 타이머 시작)
2. A에게 인앱 알림: "OO님이 이 매장 사장님으로 재신청했습니다. 이의가 없으면 7일 후
   자동으로 이전됩니다."
3. B에게 인앱 알림: "인증은 통과했습니다. 기존 사장님의 이의제기가 없으면 7일 후
   자동 승인됩니다."
4. **A가 이의제기** → 그 시점에만 관리자(`app/admin.tsx`)가 수동 판단 (승인/거절)
5. **A가 무응답으로 7일 경과** → B에게 자동 이전. 기존 `phone`/`business_hours`/
   `owner_message` 값은 유지하고 `owner_user_id`만 교체 (정보를 새로 입력할 필요 없음)
6. A는 이후 언제든 재인증하면 소유권을 되찾을 수 있다 — 이 경우도 동일하게 새 소유자(B)
   기준으로 7일 대기 흐름을 다시 거치는 **양방향 대칭 구조** (한쪽이 영구적으로 유리하지 않음)

### 3) 정보 수정

승인된 사장님은 매장 상세 화면(또는 "내 매장 관리" 화면)에서 전화번호 / 영업시간(자유
텍스트 한 줄) / 한마디(최대 100자, 앱단 입력 제한 + DB check 제약 이중 검증) / **편의시설
(주차·화장실·ATM 여부 체크 + 기타 편의시설 자유 태그)**을 수정.

편의시설(`has_parking`/`has_restroom`/`has_atm`/`amenities`)은 현재 `stores` 테이블 컬럼으로
존재하고 공공데이터 배치(`scripts/ingest/fetchStores.ts`)가 이 컬럼들을 upsert 대상에 포함하지
않아 지금 당장은 배치에 덮어써지지 않지만, 이 사실에 기대지 않는다 — 전화번호/영업시간과
동일하게 `store_owner_profiles` 오버레이로 옮겨서, 배치 스크립트가 나중에 바뀌어도 사장님이
입력한 값이 안전하게 유지되도록 한다.

**매장 상세 화면의 "주변 화장실/ATM/편의점/카페" 버튼(지도 앱으로 주변 검색)은 이 기능과
완전히 별개**다 — 사장님이 입력하는 "이 매장 자체의 편의시설 보유 여부"와, 사용자가 누르면
지도 앱에서 매장 주변 시설을 검색해주는 기능은 서로 다른 것이므로 UI/로직 모두 섞지 않는다.

## 데이터 모델

`stores` 테이블은 공공데이터 배치 수집(`scripts/ingest/*`)이 주기적으로 UPSERT하는 테이블이라
사장님 입력값을 여기 직접 두면 다음 배치 때 덮어써진다. 그래서 별도 테이블로 분리하고,
`stores`는 절대 직접 건드리지 않는다.

```
store_owner_profiles
  store_id        uuid primary key references stores(id)
  owner_user_id   uuid not null references auth.users(id)
  phone           text
  business_hours  text            -- 자유 텍스트 한 줄
  owner_message   text            -- 최대 100자, check 제약으로 서버측도 이중 검증
  has_parking     boolean
  has_restroom    boolean
  has_atm         boolean
  amenities       text[]          -- 기타 편의시설 자유 태그
  updated_at      timestamptz not null default now()

store_owner_verification_attempts        -- 재시도 카운트 + 감사 로그 (이미지 비저장)
  id                  uuid primary key
  store_id            uuid references stores(id)
  user_id             uuid references auth.users(id)
  business_reg_number text        -- 조회용, 마스킹 검토
  result              text        -- 'approved' | 'rejected'
  reject_reason       text        -- 'hometax_mismatch' | 'name_address_mismatch' 등
  created_at          timestamptz not null default now()
  -- user_id + store_id 기준 최근 5회 연속 실패 시 24h 잠금 판정에 사용

store_ownership_transfer_requests        -- 소유권 충돌 7일 대기 상태 관리
  id                      uuid primary key
  store_id                uuid references stores(id)
  previous_owner_user_id  uuid references auth.users(id)
  new_owner_user_id       uuid references auth.users(id)
  status                  text not null default 'pending'  -- 'pending' | 'disputed' | 'auto_approved' | 'admin_approved' | 'admin_rejected'
  requested_at            timestamptz not null default now()
  expires_at              timestamptz not null  -- requested_at + 7일
  resolved_at             timestamptz
  -- expires_at 지난 pending 건은 배치가 자동으로 auto_approved 처리 + 소유권 이전 실행
```

매장 상세 화면 표시 로직: `store_owner_profiles`에 값이 있으면 그 값을 우선 표시, 없으면
`stores.phone` 등 기존 공공데이터 값으로 폴백.

## 권한 (RLS)

- `store_owner_profiles`: 전체 공개 읽기. `phone`/`business_hours`/`owner_message` 갱신은
  `owner_user_id = auth.uid()`인 사용자만. **`owner_user_id` 자체를 바꾸는 소유권 이관은
  일반 클라이언트 update로 열어두지 않고, Edge Function/배치가 service role로만 수행** —
  그래야 "내가 소유권 없는 매장의 owner_user_id를 직접 덮어쓰기" 같은 우회가 불가능하다.
- `store_owner_verification_attempts`, `store_ownership_transfer_requests`: 클라이언트
  직접 접근 없음 (Edge Function/service role 전용). 단, 본인 관련 대기 상태 조회는
  사용자 본인 것만 읽기 허용(알림 배너 표시용).

## 검증 실패 시 UX

실패마다 "정보를 다시 확인해주세요" 안내 후 재시도 허용. **5회 연속 실패하면 24시간
재시도 잠금** (자동 해제, 관리자 개입 없음). 그 외 관리자 심사 큐는 만들지 않는다
(소유권 충돌의 이의제기 케이스만 예외).

## 알려진 리스크 (의도적으로 수용)

- 타이핑 입력값이 실제 대표자 본인임을 별도로 증명하지 못한다 — 사업자등록번호 등은
  등록증을 본 타인도 입력 가능. 이 설계는 사전 차단 대신, 실소유주가 재인증하면
  7일 대기(이의제기 없을 시) 후 권한을 되찾는 **사후 교정 구조**로 대응.
- 국세청 API는 사업자등록번호+개업일자+대표자성명 정확 일치가 필요 — 사장님이 개업일자를
  실수로 잘못 입력하면 정상 신청도 거절될 수 있음 (재시도로 해결).
- 7일 대기 중 실제 사장님이 앱을 안 열어 이의제기를 놓치면 의도치 않게 이전될 수 있음 —
  인앱 알림 외 별도 채널(SMS 등)은 비목표로 제외했으므로 발생 가능성 존재.

## 비용 검토 (구현 후 재점검 예정)

- 국세청 사업자등록정보 진위확인 API: 무료(공공 API), 호출량 제한 있음.
- OCR 비용: 없음 (이번 설계에서 제외).
- Storage 신규 비용: 없음 (등록증 사진 비저장, 매장 사진 기능 이번 범위 제외).
- 7일 만료 자동승인 배치: GitHub Actions 일배치 또는 pg_cron 중 구현 단계에서 선택 —
  Supabase 유료 티어 필요 여부 그때 확인.
- **사용자 요청에 따라, 전체 기능 구현 완료 후 Supabase 사용량(DB row 증가, Edge Function
  호출량), 예상 사용 기간 대비 무료/유료 티어 임계점을 종합 재검토한다.**

## 후속 작업

- 이 설계 승인 후 `writing-plans` 스킬로 구현 계획 수립
- 구현 완료 후: 위 "비용 검토" 섹션의 실측치 채워서 유지비 재평가
