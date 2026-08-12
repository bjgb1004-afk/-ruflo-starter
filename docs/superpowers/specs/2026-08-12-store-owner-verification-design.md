# 판매점 사장님 인증 및 정보 관리 기능 — 설계

- 날짜: 2026-08-12
- 상태: 설계 승인, 구현 대기

## 배경 / 목적

판매점 사장님이 본인 매장의 전화번호·영업시간·한마디 메시지를 직접 수정할 수 있게 한다.
"명당" 랭킹은 과거 당첨 이력으로 정해져 사장님이 바꿀 수 없지만, 이 정보는 사장님이
직접 신뢰도 있게 채워 넣을 수 있는 영역이다. ([[project_speeto_feature_research]]에서
논의된 "사장님 참여" 구조의 1단계 버전)

## 목표

- 사업자등록증 업로드 기반으로, 매장 소유권을 **완전자동**으로 검증해 권한을 부여한다.
- 권한을 가진 사장님이 전화번호·영업시간(자유 텍스트)·한마디를 수정할 수 있다.
- 도용/오인증 발생 시, 실제 사장님이 재인증하면 권한을 즉시 되찾을 수 있다(덮어쓰기).
- 신규 비용(SMS/ARS, Storage 등)을 최대한 배제한다.

## 비목표 (이번 범위 아님)

- 매장 사진 업로드 (추후 별도 설계)
- 전화(SMS/ARS) 본인 인증 — 재인증 덮어쓰기로 신원 도용 리스크를 사후 교정하는 쪽을 택함
- 관리자 수동 심사 폴백 — 자동 검증 실패 시에는 재시도 안내만 하고, 사람이 개입하는 큐는 만들지 않음
- 기존 일반회원 가입 절차 변경

## 사용자 흐름

1. 로그인 화면에 "복권사장님으로 가입" 진입점 추가 (일반회원 가입과 완전히 분리된 화면/절차)
2. 사장님 가입 화면: 이메일/비밀번호 + 본인 매장 검색·선택(기존 `stores` 레코드 중 하나를 지정,
   신규 매장 생성 아님) + 사업자등록증 사진 촬영/첨부
3. 제출 시 클라이언트는 사업자등록증 이미지를 **Supabase Storage에 올리지 않고, Edge Function에
   직접(base64) 전송**한다 — 어디에도 파일로 저장되지 않음.
4. Edge Function (`verify-store-owner`):
   a. OCR(네이버 CLOVA OCR 사업자등록증 템플릿)로 상호명·대표자명·사업자등록번호·개업일자·주소 추출
   b. 국세청 "사업자등록정보 진위확인" API에 {사업자등록번호, 개업일자, 대표자성명} 조회 → 상태가
      "계속사업자"인지 확인
   c. 추출된 상호/주소를 신청자가 선택한 `stores.name` / `stores.address`와 문자열 유사도 비교
   d. 세 조건 모두 통과 → 승인, 하나라도 실패 → 거절(수동 심사 없음, 재시도 안내만)
   e. 이미지는 처리 즉시 폐기(응답 반환 후 메모리에서만 존재, 어떤 스토리지에도 write 없음)
5. 승인되면 `store_owner_profiles`에 권한 반영. 이미 다른 사용자가 그 매장의 사장님으로
   승인돼 있었다면 **소유권을 새 신청자에게 덮어씀** (기존 phone/hours/message 값 자체는
   유지, `owner_user_id`만 교체) + `store_ownership_events`에 이관 기록 남김
6. 이전 사장님이 다음에 앱을 열면, 자신이 관리하던 매장의 소유권이 이관됐다는 인앱 배너를
   1회 표시 (푸시 인프라 신규 구축 없음 — DB 이벤트 존재 여부만 확인)
7. 승인된 사장님은 매장 상세 화면(또는 "내 매장 관리" 화면)에서 전화번호 / 영업시간(자유
   텍스트 한 줄) / 한마디(글자수 제한)를 수정

## 데이터 모델

`stores` 테이블은 공공데이터 배치 수집(`scripts/ingest/*`)이 주기적으로 UPSERT하는 테이블이라
사장님 입력값을 여기 직접 두면 다음 배치 때 덮어써진다. 그래서 별도 테이블로 분리한다.

```
store_owner_profiles
  store_id        uuid primary key references stores(id)
  owner_user_id   uuid not null references auth.users(id)
  phone           text
  business_hours  text            -- 자유 텍스트 한 줄
  owner_message   text            -- 최대 100자. 앱단 입력 제한 + DB check 제약으로 이중 검증
  updated_at      timestamptz not null default now()

store_owner_verifications        -- 인증 시도 감사 로그 (이미지 자체는 저장 안 함)
  id                  uuid primary key
  store_id            uuid references stores(id)
  user_id             uuid references auth.users(id)
  business_reg_number text        -- 조회용, 필요 시 마스킹 검토
  result              text        -- 'approved' | 'rejected'
  reject_reason       text        -- 'ocr_low_confidence' | 'hometax_mismatch' | 'name_address_mismatch' 등
  created_at          timestamptz not null default now()

store_ownership_events
  id                      uuid primary key
  store_id                uuid references stores(id)
  previous_owner_user_id  uuid references auth.users(id)
  new_owner_user_id       uuid references auth.users(id)
  transferred_at          timestamptz not null default now()
  previous_owner_notified boolean not null default false
```

매장 상세 화면 표시 로직: `store_owner_profiles`에 값이 있으면 그 값을 우선 표시, 없으면
`stores.phone` 등 기존 공공데이터 값으로 폴백.

## 권한 (RLS)

- `store_owner_profiles`: 전체 공개 읽기. `phone`/`business_hours`/`owner_message` 갱신은
  `owner_user_id = auth.uid()`인 사용자만. **`owner_user_id` 자체를 바꾸는 소유권 이관은
  일반 클라이언트 update로 열어두지 않고, Edge Function이 service role로만 수행** —
  그래야 "내가 소유권 없는 매장의 owner_user_id를 직접 덮어쓰기" 같은 우회가 불가능하다.
- `store_owner_verifications`, `store_ownership_events`: 클라이언트 직접 접근 없음
  (Edge Function/service role 전용).

## 검증 실패 시 UX

자동 검증 3단계 중 하나라도 실패하면 관리자 심사 큐로 넘기지 않고 "사업자등록증 정보를
다시 확인해주세요" 안내 후 재시도만 허용한다. (수동 심사 폴백은 비목표로 명시적으로 제외 —
초기 신청자 수가 적을 것으로 예상되는 콜드스타트 단계라 리스크를 감수하기로 결정함.
[[project_speeto_feature_research]] 참고)

## 알려진 리스크 (의도적으로 수용)

- **사업자등록증 사진만으로는 "업로드한 사람이 실제 대표자"임을 증명하지 못한다.** 매장에
  게시된 등록증을 촬영해 타인이 신청할 수 있음. 이번 설계는 이를 사전 차단하지 않고,
  실소유주가 재인증하면 즉시 권한을 되찾는 **사후 교정 구조**로 대응하기로 결정함
  (전화 인증 등 사전 차단 수단은 비용/구현 부담으로 이번 범위에서 제외).
- OCR 인식 실패율(사진 화질/각도)로 인한 정상 신청 거절 가능성 — 수동 심사 폴백이 없어
  재시도로만 해결 가능. 실제 이용 중 불만이 누적되면 재검토.
- 국세청 API는 사업자등록번호+개업일자+대표자성명 정확 일치가 필요해, OCR이 개업일자까지
  정확히 추출해야 함 — 이 필드 인식률이 상대적으로 낮을 경우 거절률에 영향.

## 비용 검토 (구현 후 재점검 예정)

- 네이버 CLOVA OCR: 건당 과금 (사장님 가입 시도 1건당 1회 호출) — 초기엔 신청자 수 자체가
  적어 영향 작음, 실제 단가는 구현 단계에서 확인.
- 국세청 사업자등록정보 진위확인 API: 무료(공공 API), 호출량 제한 있음.
- Storage 신규 비용: 없음 (등록증 이미지 비저장, 매장 사진 기능 이번 범위 제외).
- **사용자 요청에 따라, 전체 기능 구현 완료 후 Supabase 사용량(DB row 증가, Edge Function
  호출량), 예상 사용 기간 대비 무료/유료 티어 임계점, OCR 실사용 단가를 종합 재검토한다.**

## 후속 작업

- 이 설계 승인 후 `writing-plans` 스킬로 구현 계획 수립
- 구현 완료 후: 위 "비용 검토" 섹션의 실측치 채워서 유지비 재평가
