# 판매점 사장님 인증 및 정보 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 판매점 사장님이 사업자 정보를 직접 타이핑 입력하면 국세청 진위확인 API + 매장 DB 유사도 대조로 검증하고, 통과하면 전화번호/영업시간/한마디를 직접 수정할 수 있게 한다. 소유권 충돌은 7일 이의제기 유예 후 자동 이전한다.

**Architecture:** 3개 신규 테이블(`store_owner_profiles`/`store_owner_verification_attempts`/`store_ownership_transfer_requests`)을 `stores` 테이블과 완전히 분리해 오버레이 방식으로 둔다. 검증·소유권 이전은 전부 service role(Edge Function `verify-store-owner`) 또는 `SECURITY DEFINER` RPC를 통해서만 수행하고, 클라이언트 RLS로는 절대 `owner_user_id`를 직접 바꿀 수 없게 한다. 7일 만료 자동승인은 pg_cron(DB 내부, 외부 API 호출 없는 순수 상태 전이이므로)으로 처리한다.

**Tech Stack:** Supabase (Postgres + PostGIS + pg_trgm + pg_cron), Supabase Edge Functions(Deno), React Native/Expo Router, `@tanstack/react-query`, Zustand(`useAuth`), Jest(순수 로직 유닛 테스트).

## Global Constraints

- OCR 미사용, 사업자등록증 사진은 저장하지 않는다 (design 비목표).
- `stores` 테이블은 배치(`scripts/ingest/*`)가 주기적으로 UPSERT하므로 절대 직접 수정하지 않는다 — 항상 `store_owner_profiles`로 오버레이한다.
- `owner_user_id` 변경(소유권 이관)은 클라이언트 RLS UPDATE로 절대 열지 않는다 — Edge Function 또는 `SECURITY DEFINER` RPC(service-role 동등 권한)로만 수행한다.
- 5회 연속 실패(최근 5건이 모두 `rejected`) + 가장 최근 실패가 24시간 이내면 재시도 잠금, 시간 경과 시 자동 해제(별도 unlock 처리 로직 불필요).
- 소유권 충돌 시 즉시 이전 금지 — 7일 대기 + 기존 사장님 이의제기(`disputed`) 가능, 이의제기 시에만 관리자(`app/admin.tsx`) 수동 판단.
- 신규 유료 의존성/서비스를 추가하지 않는다 (OCR/SMS/Storage 등 금지) — 기존 Supabase 프로젝트 안에서 해결한다.
- 국세청 API 서비스키(`NTS_API_SERVICE_KEY`)는 Edge Function 시크릿으로만 보관, 클라이언트 번들에 절대 노출하지 않는다.
- 기존 코드 패턴을 그대로 따른다: feature 폴더는 `api/`, 훅, 컴포넌트로 구성(`src/features/favorites`, `src/features/admin` 참고), 마이그레이션 파일명은 `YYYYMMDDHHMMSS_설명.sql`, RLS는 테이블 생성과 같은 마이그레이션에서 함께 정의, `Database` 타입은 `src/types/database.types.ts`에 수동으로 갱신한다.
- 신규 npm 의존성(날짜 선택기, 유사도 라이브러리 등)을 추가하지 않는다 — 이미 설치된 `pg_trgm`(유사도), 순수 TextInput(날짜 입력)으로 해결한다.

---

## Phase 1 — DB 스키마 & RLS

### Task 1: 핵심 테이블 3개 + RLS + 검증/이의제기 함수

**Files:**
- Create: `supabase/migrations/20260812000000_add_store_owner_verification.sql`

**Interfaces:**
- Produces: 테이블 `store_owner_profiles(store_id, owner_user_id, phone, business_hours, owner_message, updated_at)`, `store_owner_verification_attempts(id, store_id, user_id, business_reg_number, result, reject_reason, created_at)`, `store_ownership_transfer_requests(id, store_id, previous_owner_user_id, new_owner_user_id, status, requested_at, expires_at, resolved_at)`.
- Produces: RPC 함수 `public.name_similarity(a text, b text) returns real`, `public.dispute_ownership_transfer(p_request_id uuid) returns void`, `public.resolve_disputed_transfer(p_request_id uuid, p_approve boolean) returns void`, `public.admin_disputed_transfers() returns table(id uuid, store_id uuid, store_name text, previous_owner_email text, new_owner_email text, requested_at timestamptz, expires_at timestamptz)`.
- Consumes: 기존 `public.set_updated_at()` 트리거 함수, 기존 `public.is_admin()` 함수(`20260808020000_add_server_side_admin_check.sql`), 기존 `extensions.similarity()`(pg_trgm, `20260803000000_init_schema.sql`에서 이미 활성화됨).

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 판매점 사장님 인증 및 정보 관리. 설계: docs/superpowers/specs/2026-08-12-store-owner-verification-design.md
--
-- stores 테이블은 공공데이터 배치(scripts/ingest/*)가 주기적으로 UPSERT하므로 사장님 입력값을
-- 여기 저장하면 다음 배치 때 덮어써진다. 그래서 완전히 분리된 테이블에 저장하고 stores는 건드리지 않는다.

create table if not exists public.store_owner_profiles (
  store_id       uuid primary key references public.stores(id) on delete cascade,
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  phone          text,
  business_hours text,
  owner_message  text,
  updated_at     timestamptz not null default now(),
  constraint chk_owner_message_length check (owner_message is null or char_length(owner_message) <= 100)
);

comment on table public.store_owner_profiles is
  '사장님이 직접 입력한 매장 정보 오버레이. 화면 표시 시 이 테이블 값이 있으면 우선 표시하고,
   없으면 stores 값으로 폴백한다.';
comment on column public.store_owner_profiles.owner_message is
  '사장님 한마디, 최대 100자(앱단 입력 제한 + 이 check 제약으로 이중 검증)';

drop trigger if exists trg_store_owner_profiles_updated_at on public.store_owner_profiles;
create trigger trg_store_owner_profiles_updated_at
  before update on public.store_owner_profiles
  for each row execute function public.set_updated_at();

alter table public.store_owner_profiles enable row level security;

create policy "store_owner_profiles_public_read" on public.store_owner_profiles
  for select using (true);

create policy "store_owner_profiles_own_update" on public.store_owner_profiles
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- owner_user_id는 소유권 그 자체다 - 컬럼 단위 권한으로 일반 클라이언트가 절대 못 건드리게
-- 막는다(RLS는 "행" 단위 제어만 하므로 컬럼 제한은 GRANT/REVOKE로 별도 잠가야 한다).
-- insert/소유권 최초 지정/이관은 Edge Function 또는 아래 SECURITY DEFINER 함수(service role과
-- 동등한 권한으로 RLS를 우회)로만 수행한다.
revoke update on public.store_owner_profiles from authenticated;
grant update (phone, business_hours, owner_message) on public.store_owner_profiles to authenticated;

create table if not exists public.store_owner_verification_attempts (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  business_reg_number text not null,
  result              text not null check (result in ('approved', 'rejected')),
  reject_reason       text check (reject_reason in ('hometax_mismatch', 'business_closed', 'name_mismatch')),
  created_at          timestamptz not null default now()
);

comment on table public.store_owner_verification_attempts is
  '사장님 인증 시도 감사 로그. 최근 5건이 모두 rejected이고 가장 최근 시도가 24시간 이내면
   재시도를 잠근다(evaluateLockout, supabase/functions/_shared/verifyStoreOwnerLogic.ts).
   사업자등록증 이미지는 저장하지 않는다(OCR 미사용 설계). business_reg_number는 조회용으로
   원문 저장 - 마스킹은 후속 검토 대상(설계 문서 "알려진 리스크" 참고).';

create index if not exists idx_verification_attempts_user_store_created
  on public.store_owner_verification_attempts (user_id, store_id, created_at desc);

alter table public.store_owner_verification_attempts enable row level security;
-- 의도적으로 정책을 하나도 만들지 않는다 - RLS가 켜진 테이블에 permissive 정책이 없으면
-- 기본적으로 모든 접근이 거부된다. Edge Function(service role)만 select/insert 가능.

create table if not exists public.store_ownership_transfer_requests (
  id                     uuid primary key default gen_random_uuid(),
  store_id               uuid not null references public.stores(id) on delete cascade,
  previous_owner_user_id uuid not null references auth.users(id) on delete cascade,
  new_owner_user_id      uuid not null references auth.users(id) on delete cascade,
  status                 text not null default 'pending'
                           check (status in ('pending', 'disputed', 'auto_approved', 'admin_approved', 'admin_rejected')),
  requested_at           timestamptz not null default now(),
  expires_at             timestamptz not null,
  resolved_at            timestamptz
);

comment on table public.store_ownership_transfer_requests is
  '소유권 충돌(재신청) 시 7일 대기 상태 관리. expires_at 지난 pending 건은
   process_expired_ownership_transfers() 배치(pg_cron, 다음 마이그레이션)가 auto_approved 처리 +
   소유권 이전을 수행한다.';

create index if not exists idx_transfer_requests_pending_expiry
  on public.store_ownership_transfer_requests (expires_at) where status = 'pending';
create index if not exists idx_transfer_requests_store on public.store_ownership_transfer_requests (store_id);

alter table public.store_ownership_transfer_requests enable row level security;

-- 본인이 이전 사장님(A) 또는 신청자(B)로 관련된 요청만 읽기 허용(알림 배너 표시용).
-- insert/update는 클라이언트에 열지 않는다 - Edge Function(신규 요청 생성)과 아래
-- dispute_ownership_transfer()/resolve_disputed_transfer()(service role과 동등한 권한으로
-- RLS를 우회하는 SECURITY DEFINER)가 대신 수행한다.
create policy "transfer_requests_own_select" on public.store_ownership_transfer_requests
  for select using (auth.uid() = previous_owner_user_id or auth.uid() = new_owner_user_id);

-- 신청자가 타이핑한 상호명과 stores.name의 trigram 유사도(pg_trgm, 0~1 범위).
create or replace function public.name_similarity(a text, b text)
returns real
language sql
stable
as $$
  select extensions.similarity(lower(trim(a)), lower(trim(b)));
$$;

comment on function public.name_similarity(text, text) is
  '임계값(0.3)은 supabase/functions/_shared/verifyStoreOwnerLogic.ts의 NAME_SIMILARITY_THRESHOLD와
   반드시 함께 맞춰야 한다.';

-- 기존 사장님(A)이 소유권 이전 대기 요청에 이의를 제기한다.
create or replace function public.dispute_ownership_transfer(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.store_ownership_transfer_requests
  set status = 'disputed'
  where id = p_request_id
    and status = 'pending'
    and previous_owner_user_id = auth.uid();

  if not found then
    raise exception 'not authorized or request not in pending state';
  end if;
end;
$$;

comment on function public.dispute_ownership_transfer(uuid) is
  'pending 상태이고 본인이 previous_owner_user_id인 요청만 disputed로 전환 가능 - 이후 처리는
   관리자(app/admin.tsx, resolve_disputed_transfer)가 수행.';

-- 관리자가 이의제기된(disputed) 요청을 승인/거절한다.
create or replace function public.resolve_disputed_transfer(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_new_owner uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select store_id, new_owner_user_id into v_store_id, v_new_owner
  from public.store_ownership_transfer_requests
  where id = p_request_id and status = 'disputed';

  if not found then
    raise exception 'request not found or not in disputed state';
  end if;

  if p_approve then
    update public.store_owner_profiles
    set owner_user_id = v_new_owner
    where store_id = v_store_id;

    update public.store_ownership_transfer_requests
    set status = 'admin_approved', resolved_at = now()
    where id = p_request_id;
  else
    update public.store_ownership_transfer_requests
    set status = 'admin_rejected', resolved_at = now()
    where id = p_request_id;
  end if;
end;
$$;

comment on function public.resolve_disputed_transfer(uuid, boolean) is
  '관리자 전용(is_admin() 검증). approve=true면 store_owner_profiles.owner_user_id를 새 사장님으로
   교체하고 admin_approved, false면 admin_rejected로 종료(기존 소유자 유지).';

-- 관리자 페이지(app/admin.tsx)의 이의제기 큐 - auth.users에 직접 접근하지 않고 이메일만 안전하게 노출.
create or replace function public.admin_disputed_transfers()
returns table (
  id uuid,
  store_id uuid,
  store_name text,
  previous_owner_email text,
  new_owner_email text,
  requested_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    t.id, t.store_id, s.name,
    pu.email, nu.email,
    t.requested_at, t.expires_at
  from public.store_ownership_transfer_requests t
  join public.stores s on s.id = t.store_id
  join auth.users pu on pu.id = t.previous_owner_user_id
  join auth.users nu on nu.id = t.new_owner_user_id
  where t.status = 'disputed'
  order by t.requested_at asc;
end;
$$;
```

- [ ] **Step 2: 로컬에 적용**

Run: `npx supabase start` (최초 1회) 후 `npx supabase db reset`
Expected: 콘솔에 `20260812000000_add_store_owner_verification.sql` 적용 로그가 에러 없이 출력됨.

- [ ] **Step 3: psql로 동작 검증**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
select public.name_similarity('CU 강남역점', 'CU강남역점') as sim_high,
       public.name_similarity('CU 강남역점', '전혀다른상호') as sim_low;
"
```
Expected: `sim_high`가 0.5 이상, `sim_low`가 0.3 미만으로 출력됨(임계값 판정에 쓰일 값이므로 두 값의 차이가 명확한지 눈으로 확인).

Run (컬럼 권한 확인 — authenticated 롤로 owner_user_id를 직접 못 바꾸는지):
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
select has_column_privilege('authenticated', 'public.store_owner_profiles', 'owner_user_id', 'update') as can_update_owner,
       has_column_privilege('authenticated', 'public.store_owner_profiles', 'phone', 'update') as can_update_phone;
"
```
Expected: `can_update_owner = f`, `can_update_phone = t`.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260812000000_add_store_owner_verification.sql
git commit -m "feat: 판매점 사장님 인증/소유권 이전 테이블 및 RLS 추가"
```

---

### Task 2: 7일 만료 자동승인 배치 (pg_cron)

**Files:**
- Create: `supabase/migrations/20260812010000_add_store_owner_transfer_autoresolve.sql`

**Interfaces:**
- Consumes: `store_ownership_transfer_requests`, `store_owner_profiles`, `app_error_logs`(기존 테이블, `20260808000000_add_admin_support.sql`).
- Produces: `public.process_expired_ownership_transfers() returns void`, pg_cron 스케줄 `process-expired-ownership-transfers`.

**설계 판단 — GitHub Actions 일배치 vs pg_cron: pg_cron을 선택.**
- 이 작업은 순수 DB 상태 전이(만료된 `pending`을 `auto_approved`로 바꾸고 `owner_user_id` 교체)이고 외부 API 호출이 전혀 없다. Postgres 안에서 끝나는 일을 굳이 네트워크 왕복(GH Actions → Supabase REST)으로 옮길 이유가 없다 — 실패 지점만 늘어난다.
- GitHub Actions의 `schedule` 트리거는 **저장소가 60일간 커밋 활동이 없으면 GitHub이 자동으로 비활성화**한다. 1인 개발 사이드 프로젝트는 몇 달씩 손을 놓는 경우가 실제로 있고, 그 경우 소유권 이전이 영구적으로 멈춰버린다 — pg_cron은 DB에 상주하므로 이 리스크가 없다.
- 신규 비용 없음: pg_cron은 Supabase Free 티어에서도 쓸 수 있는 Postgres 확장이다.
- 기존 `sync-data.yml`(GH Actions)은 "외부 공공 API에서 데이터를 가져와야" 해서 Actions가 필요했던 것 — 이번 배치는 전제가 다르다(순수 내부 트랜잭션).
- 트레이드오프: GH Actions Run 로그 같은 가시성은 없다 — 처리 건수가 있을 때만 `app_error_logs`에 기록해 `app/admin.tsx`에서 확인 가능하게 한다(아래 함수 참고).

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 7일 대기 만료 소유권 이전 자동 처리 배치. 판단 근거는
-- docs/superpowers/plans/2026-08-12-store-owner-verification-plan.md Task 2 참고.

create extension if not exists pg_cron;

create or replace function public.process_expired_ownership_transfers()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
begin
  create temporary table _expired_transfers on commit drop as
  select id, store_id, new_owner_user_id
  from public.store_ownership_transfer_requests
  where status = 'pending' and expires_at <= now()
  for update skip locked;

  update public.store_owner_profiles p
  set owner_user_id = e.new_owner_user_id
  from _expired_transfers e
  where p.store_id = e.store_id;

  update public.store_ownership_transfer_requests t
  set status = 'auto_approved', resolved_at = now()
  from _expired_transfers e
  where t.id = e.id;

  select count(*) into v_processed from _expired_transfers;

  if v_processed > 0 then
    insert into public.app_error_logs (feature, message)
    values ('store-owner-transfer-batch', v_processed || '건 소유권 자동 이전 처리');
  end if;
end;
$$;

comment on function public.process_expired_ownership_transfers() is
  '7일 대기(expires_at) 지난 pending 소유권 이전 요청을 auto_approved로 전환하고
   store_owner_profiles.owner_user_id를 새 사장님으로 교체한다. 기존 phone/business_hours/
   owner_message 값은 유지(재입력 불필요). pg_cron이 매일 실행한다.
   ponytail: 동일 store에 대해 서로 다른 신청자(B, C)가 동시에 pending 상태를 가질 수 있는
   경합 케이스는 처리하지 않는다(설계 문서가 다루지 않은 드문 경우) - 실제로 발생하면
   store_id unique partial index로 pending 1건 제한을 추가할 것.';

select cron.schedule(
  'process-expired-ownership-transfers',
  '0 19 * * *', -- 매일 UTC 19:00 = KST 04:00(사용량 적은 새벽 시간대)
  $$select public.process_expired_ownership_transfers();$$
);
```

- [ ] **Step 2: 로컬에 적용 및 함수 단위 동작 검증**

Run: `npx supabase db reset`
Expected: 에러 없이 적용됨. (로컬 Supabase는 pg_cron이 기본 비활성화일 수 있음 — `create extension` 단계에서 실패하면 Supabase Studio(`http://127.0.0.1:54323`) → Database → Extensions에서 `pg_cron` 활성화 후 재시도. 원격 프로젝트에 `db push`하기 전에도 Dashboard → Database → Extensions에서 `pg_cron`이 보이는지 먼저 확인할 것.)

Run (수동으로 만료 처리 로직 검증 — 더미 데이터로 함수 직접 호출):
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
-- 준비: 더미 유저/매장/프로필/만료된 이전 요청 삽입 (id는 예시)
select public.process_expired_ownership_transfers();
select status from public.store_ownership_transfer_requests where id = '<위에서 넣은 id>';
"
```
Expected: `status`가 `auto_approved`로 바뀜, `store_owner_profiles.owner_user_id`가 새 소유자로 바뀜. (더미 데이터 삽입 SQL은 실행 시점에 로컬 `auth.users`/`stores`의 실제 존재하는 id를 사용해서 채운다.)

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260812010000_add_store_owner_transfer_autoresolve.sql
git commit -m "feat: 소유권 이전 7일 만료 자동승인 pg_cron 배치 추가"
```

---

### Task 3: `database.types.ts`에 신규 테이블 타입 추가

**Files:**
- Modify: `src/types/database.types.ts`

**Interfaces:**
- Produces: `Database['public']['Tables']['store_owner_profiles']`, `['store_owner_verification_attempts']`, `['store_ownership_transfer_requests']` (Row/Insert/Update), 이후 모든 client 코드가 이 타입을 사용한다.

- [ ] **Step 1: 기존 `app_notices`/`user_favorite_stores` 항목 바로 아래에 추가**

```ts
      store_owner_profiles: {
        Row: {
          store_id: string
          owner_user_id: string
          phone: string | null
          business_hours: string | null
          owner_message: string | null
          updated_at: string
        }
        Insert: Pick<Database['public']['Tables']['store_owner_profiles']['Row'], "store_id" | "owner_user_id"> &
          Partial<Omit<Database['public']['Tables']['store_owner_profiles']['Row'], "store_id" | "owner_user_id" | "updated_at">>
        Update: Partial<Omit<Database['public']['Tables']['store_owner_profiles']['Row'], "store_id" | "updated_at">>
        Relationships: []
      }
      store_owner_verification_attempts: {
        Row: {
          id: string
          store_id: string
          user_id: string
          business_reg_number: string
          result: "approved" | "rejected"
          reject_reason: "hometax_mismatch" | "business_closed" | "name_mismatch" | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['store_owner_verification_attempts']['Row'], "id" | "created_at">
        Update: never
        Relationships: []
      }
      store_ownership_transfer_requests: {
        Row: {
          id: string
          store_id: string
          previous_owner_user_id: string
          new_owner_user_id: string
          status: "pending" | "disputed" | "auto_approved" | "admin_approved" | "admin_rejected"
          requested_at: string
          expires_at: string
          resolved_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['store_ownership_transfer_requests']['Row'], "id" | "requested_at" | "resolved_at" | "status"> &
          Partial<Pick<Database['public']['Tables']['store_ownership_transfer_requests']['Row'], "status">>
        Update: never
        Relationships: []
      }
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음(0 errors). 기존 코드 어디도 이 새 타입을 아직 참조하지 않으므로 통과해야 한다.

- [ ] **Step 3: 커밋**

```bash
git add src/types/database.types.ts
git commit -m "feat: store_owner_* 테이블 Database 타입 추가"
```

---

## Phase 2 — Edge Function

### Task 4: 순수 판정 로직 (`_shared`) + Jest 유닛 테스트

**Files:**
- Create: `supabase/functions/_shared/verifyStoreOwnerLogic.ts`
- Test: `supabase/functions/_shared/verifyStoreOwnerLogic.test.ts`

**Interfaces:**
- Produces: `LOCKOUT_ATTEMPT_COUNT`, `LOCKOUT_DURATION_MS`, `NAME_SIMILARITY_THRESHOLD`, `type VerificationAttempt = { result: "approved" | "rejected"; created_at: string }`, `evaluateLockout(recentAttempts: VerificationAttempt[], now?: Date): { locked: boolean; unlockAt: string | null }`, `isNameSimilar(score: number, threshold?: number): boolean`, `type RejectReason = "hometax_mismatch" | "business_closed" | "name_mismatch"`, `classifyVerification(input: { hometaxValid: boolean; businessStatus: string | null; nameSimilarityScore: number }): { approved: boolean; reason: RejectReason | null }`.
- Consumes: 없음(순수 함수, Deno 전용 API 미사용 — 그래서 이 프로젝트의 기본 Jest 설정(`npx jest --showConfig`로 확인함: `testEnvironment: node`, `babel-jest` transform이 `babel.config.js`를 그대로 읽어 TS를 변환)만으로 실행 가능. Edge Function(`index.ts`)이 상대경로 `../_shared/verifyStoreOwnerLogic.ts`로 그대로 import한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// supabase/functions/_shared/verifyStoreOwnerLogic.test.ts
import {
  evaluateLockout,
  isNameSimilar,
  classifyVerification,
  LOCKOUT_ATTEMPT_COUNT,
} from "./verifyStoreOwnerLogic";

describe("evaluateLockout", () => {
  it("잠금 없음: 시도 5건 미만이면 잠기지 않는다", () => {
    const attempts = Array.from({ length: LOCKOUT_ATTEMPT_COUNT - 1 }, (_, i) => ({
      result: "rejected" as const,
      created_at: new Date(Date.now() - i * 1000).toISOString(),
    }));
    expect(evaluateLockout(attempts).locked).toBe(false);
  });

  it("잠금: 최근 5건이 모두 rejected이고 마지막 실패가 24시간 이내면 잠긴다", () => {
    const now = new Date("2026-08-12T10:00:00Z");
    const attempts = Array.from({ length: LOCKOUT_ATTEMPT_COUNT }, (_, i) => ({
      result: "rejected" as const,
      created_at: new Date(now.getTime() - i * 60_000).toISOString(),
    }));
    const result = evaluateLockout(attempts, now);
    expect(result.locked).toBe(true);
    expect(result.unlockAt).toBe(new Date(now.getTime() - 0 + 24 * 60 * 60 * 1000).toISOString());
  });

  it("잠금 해제: 마지막 실패로부터 24시간이 지나면 잠기지 않는다", () => {
    const now = new Date("2026-08-13T11:00:00Z"); // 25시간 후
    const attempts = Array.from({ length: LOCKOUT_ATTEMPT_COUNT }, (_, i) => ({
      result: "rejected" as const,
      created_at: new Date("2026-08-12T10:00:00Z").getTime() - i * 60_000,
    })).map((a) => ({ result: a.result, created_at: new Date(a.created_at).toISOString() }));
    expect(evaluateLockout(attempts, now).locked).toBe(false);
  });

  it("잠금 없음: 최근 5건 중 하나라도 approved면 잠기지 않는다", () => {
    const attempts = [
      { result: "rejected" as const, created_at: new Date().toISOString() },
      { result: "approved" as const, created_at: new Date().toISOString() },
      { result: "rejected" as const, created_at: new Date().toISOString() },
      { result: "rejected" as const, created_at: new Date().toISOString() },
      { result: "rejected" as const, created_at: new Date().toISOString() },
    ];
    expect(evaluateLockout(attempts).locked).toBe(false);
  });
});

describe("isNameSimilar", () => {
  it("임계값 이상이면 true", () => {
    expect(isNameSimilar(0.3)).toBe(true);
    expect(isNameSimilar(0.29)).toBe(false);
  });
});

describe("classifyVerification", () => {
  it("국세청 진위확인 실패 시 hometax_mismatch로 거절", () => {
    expect(
      classifyVerification({ hometaxValid: false, businessStatus: "01", nameSimilarityScore: 1 }),
    ).toEqual({ approved: false, reason: "hometax_mismatch" });
  });

  it("휴업/폐업 상태면 business_closed로 거절", () => {
    expect(
      classifyVerification({ hometaxValid: true, businessStatus: "03", nameSimilarityScore: 1 }),
    ).toEqual({ approved: false, reason: "business_closed" });
  });

  it("상호 유사도 미달이면 name_mismatch로 거절", () => {
    expect(
      classifyVerification({ hometaxValid: true, businessStatus: "01", nameSimilarityScore: 0.1 }),
    ).toEqual({ approved: false, reason: "name_mismatch" });
  });

  it("모두 통과하면 승인", () => {
    expect(
      classifyVerification({ hometaxValid: true, businessStatus: "01", nameSimilarityScore: 0.9 }),
    ).toEqual({ approved: true, reason: null });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest supabase/functions/_shared/verifyStoreOwnerLogic.test.ts`
Expected: FAIL — `Cannot find module './verifyStoreOwnerLogic'`.

- [ ] **Step 3: 최소 구현 작성**

```ts
// supabase/functions/_shared/verifyStoreOwnerLogic.ts
//
// Deno(Edge Function)와 Node(Jest) 양쪽에서 그대로 import되는 순수 로직 - Deno 전용 API를
// 쓰지 않는다. 실제 국세청 API 호출/DB 조회는 이 파일 밖(index.ts, hometax.ts)에서 하고,
// 여기는 "주어진 값으로 무엇을 판단할지"만 담당한다.

export const LOCKOUT_ATTEMPT_COUNT = 5;
export const LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000;
export const NAME_SIMILARITY_THRESHOLD = 0.3;

export interface VerificationAttempt {
  result: "approved" | "rejected";
  created_at: string; // ISO
}

// recentAttempts는 반드시 created_at 내림차순(최신이 먼저)으로 최근 N건을 넘겨야 한다.
export function evaluateLockout(
  recentAttempts: VerificationAttempt[],
  now: Date = new Date(),
): { locked: boolean; unlockAt: string | null } {
  if (recentAttempts.length < LOCKOUT_ATTEMPT_COUNT) {
    return { locked: false, unlockAt: null };
  }
  const lastFive = recentAttempts.slice(0, LOCKOUT_ATTEMPT_COUNT);
  const allRejected = lastFive.every((a) => a.result === "rejected");
  if (!allRejected) {
    return { locked: false, unlockAt: null };
  }
  const mostRecentFailAt = new Date(lastFive[0].created_at).getTime();
  const unlockAtMs = mostRecentFailAt + LOCKOUT_DURATION_MS;
  if (now.getTime() < unlockAtMs) {
    return { locked: true, unlockAt: new Date(unlockAtMs).toISOString() };
  }
  return { locked: false, unlockAt: null };
}

export function isNameSimilar(score: number, threshold: number = NAME_SIMILARITY_THRESHOLD): boolean {
  return score >= threshold;
}

export type RejectReason = "hometax_mismatch" | "business_closed" | "name_mismatch";

const CONTINUING_BUSINESS_STATUS_CODE = "01"; // 계속사업자

export function classifyVerification(input: {
  hometaxValid: boolean;
  businessStatus: string | null;
  nameSimilarityScore: number;
}): { approved: boolean; reason: RejectReason | null } {
  if (!input.hometaxValid) return { approved: false, reason: "hometax_mismatch" };
  if (input.businessStatus !== CONTINUING_BUSINESS_STATUS_CODE) {
    return { approved: false, reason: "business_closed" };
  }
  if (!isNameSimilar(input.nameSimilarityScore)) return { approved: false, reason: "name_mismatch" };
  return { approved: true, reason: null };
}
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx jest supabase/functions/_shared/verifyStoreOwnerLogic.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/_shared/verifyStoreOwnerLogic.ts supabase/functions/_shared/verifyStoreOwnerLogic.test.ts
git commit -m "feat: 사장님 인증 판정 순수 로직(잠금/유사도/승인판정) + 유닛 테스트"
```

---

### Task 5: 국세청 진위확인 API 클라이언트 (`hometax.ts`)

**Files:**
- Create: `supabase/functions/verify-store-owner/hometax.ts`

**Interfaces:**
- Produces: `fetchBusinessValidation(bizRegNumber: string, openDate: string, repName: string): Promise<{ valid: boolean; businessStatusCode: string | null }>`.
- Consumes: `Deno.env.get("NTS_API_SERVICE_KEY")`.

**API 사양 (조사 결과, 배포 전 Step 2에서 재검증할 것):**
- 데이터셋: 공공데이터포털(data.go.kr) "국세청_사업자등록정보 진위확인 및 상태조회 서비스" — `DATA_GO_KR_SETUP.md`의 `api.data.go.kr`와 게이트웨이가 다른 `api.odcloud.kr` 계열이다.
- 활용신청 후 발급되는 `serviceKey`(디코딩 키)를 그대로 query param으로 사용.
- 엔드포인트: `POST https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=<key>`
- 요청 바디: `{ "businesses": [ { "b_no": "<10자리 숫자>", "start_dt": "<YYYYMMDD>", "p_nm": "<대표자명>" } ] }`
- 응답: `{ "status_code": "OK", "data": [ { "b_no": "...", "valid": "01"|"02", "status": { "b_stt_cd": "01"|"02"|"03", ... } } ] }` — `valid: "01"`이 일치, `b_stt_cd: "01"`이 계속사업자.

- [ ] **Step 1: 파일 작성**

```ts
// supabase/functions/verify-store-owner/hometax.ts
//
// 국세청 사업자등록정보 진위확인 API (공공데이터포털, data.go.kr).
// 신청: data.go.kr에서 "국세청_사업자등록정보 진위확인 및 상태조회 서비스" 활용신청 후
// 발급받은 serviceKey를 Edge Function 시크릿(NTS_API_SERVICE_KEY)으로 저장한다.
//   npx supabase secrets set NTS_API_SERVICE_KEY=발급받은키 --project-ref <project-ref>
//
// DATA_GO_KR_SETUP.md의 api.data.go.kr(온라인복권 배출점 API)와는 다른 게이트웨이
// (api.odcloud.kr)를 쓰는 API 계열이라 별도로 조사했다 - 배포 전 이 파일 하단 주석의 curl로
// 실제 응답 필드명이 아래 타입과 일치하는지 반드시 먼저 확인할 것(문서 필드명이 바뀌었을 수 있음).

const NTS_VALIDATE_URL = "https://api.odcloud.kr/api/nts-businessman/v1/validate";

interface HometaxValidateResponse {
  status_code: string;
  data?: {
    b_no: string;
    valid: "01" | "02";
    valid_msg?: string;
    status?: {
      b_stt_cd?: string; // "01" = 계속사업자, "02" = 휴업자, "03" = 폐업자
    };
  }[];
}

export interface BusinessValidationResult {
  valid: boolean; // 사업자등록번호+개업일자+대표자성명 일치 여부
  businessStatusCode: string | null;
}

export async function fetchBusinessValidation(
  bizRegNumber: string,
  openDate: string,
  repName: string,
): Promise<BusinessValidationResult> {
  const serviceKey = Deno.env.get("NTS_API_SERVICE_KEY");
  if (!serviceKey) throw new Error("NTS_API_SERVICE_KEY 미설정");

  const url = `${NTS_VALIDATE_URL}?serviceKey=${encodeURIComponent(serviceKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businesses: [{ b_no: bizRegNumber.replace(/-/g, ""), start_dt: openDate, p_nm: repName }],
    }),
  });

  if (!res.ok) {
    throw new Error(`국세청 API 오류: ${res.status}`);
  }

  const json = (await res.json()) as HometaxValidateResponse;
  const result = json.data?.[0];
  if (!result) throw new Error("국세청 API 응답에 결과 없음");

  return {
    valid: result.valid === "01",
    businessStatusCode: result.status?.b_stt_cd ?? null,
  };
}

/*
 * 배포 전 수동 확인(1회):
 *
 * curl -X POST "https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=발급받은_디코딩_키" \
 *   -H "Content-Type: application/json" \
 *   -d '{"businesses":[{"b_no":"실제테스트사업자번호","start_dt":"20210401","p_nm":"대표자명"}]}'
 *
 * 응답의 data[0].valid, data[0].status.b_stt_cd 필드가 위 타입과 일치하는지 확인하고,
 * 다르면 이 파일의 HometaxValidateResponse 타입과 매핑 로직을 실제 응답에 맞게 수정한다.
 */
```

- [ ] **Step 2: 실제 API로 수동 확인**

Run: 위 파일 하단 주석의 curl 명령을 발급받은 실제 serviceKey와 본인 사업자정보(또는 국세청이 테스트용으로 안내하는 값)로 실행.
Expected: `data[0].valid`, `data[0].status.b_stt_cd` 필드가 정확히 존재. 없거나 이름이 다르면 이 Step에서 타입/매핑을 먼저 고치고 다음 Task로 넘어간다(잘못된 가정 위에 Edge Function을 쌓지 않기 위함).

- [ ] **Step 3: 커밋**

```bash
git add supabase/functions/verify-store-owner/hometax.ts
git commit -m "feat: 국세청 사업자등록정보 진위확인 API 클라이언트"
```

---

### Task 6: Edge Function 메인 핸들러 (`index.ts`)

**Files:**
- Create: `supabase/functions/verify-store-owner/index.ts`

**Interfaces:**
- Consumes: `evaluateLockout`, `classifyVerification`, `LOCKOUT_ATTEMPT_COUNT`(Task 4), `fetchBusinessValidation`(Task 5), 테이블 `store_owner_verification_attempts`/`store_owner_profiles`/`store_ownership_transfer_requests`(Task 1), RPC `name_similarity`(Task 1).
- Produces: `POST /functions/v1/verify-store-owner` — 요청 바디 `{ storeId, bizName, bizRegNumber, repName, openDate }`(모두 string), 응답은 아래 6개 형태 중 하나(JSON, HTTP status 함께):
  - `200 { status: "approved" }`
  - `200 { status: "already_owner" }`
  - `200 { status: "transfer_pending", transferRequestId: string }`
  - `200 { status: "rejected", reason: "hometax_mismatch" | "business_closed" | "name_mismatch" }`
  - `423 { status: "locked", unlockAt: string }`
  - `400/401/404/500 { error: string }`

- [ ] **Step 1: 파일 작성**

```ts
// supabase/functions/verify-store-owner/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchBusinessValidation } from "./hometax.ts";
import {
  evaluateLockout,
  classifyVerification,
  LOCKOUT_ATTEMPT_COUNT,
  type VerificationAttempt,
} from "../_shared/verifyStoreOwnerLogic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  const body = await req.json().catch(() => null);
  if (!body?.storeId || !body?.bizName || !body?.bizRegNumber || !body?.repName || !body?.openDate) {
    return json({ error: "missing required fields" }, 400);
  }
  const { storeId, bizName, bizRegNumber, repName, openDate } = body as Record<string, string>;

  // 1) 잠금 판정
  const { data: recentAttempts, error: attemptsError } = await admin
    .from("store_owner_verification_attempts")
    .select("result, created_at")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(LOCKOUT_ATTEMPT_COUNT);
  if (attemptsError) return json({ error: attemptsError.message }, 500);

  const lockout = evaluateLockout((recentAttempts ?? []) as VerificationAttempt[]);
  if (lockout.locked) return json({ status: "locked", unlockAt: lockout.unlockAt }, 423);

  // 2) 대상 매장 확인
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id, name")
    .eq("id", storeId)
    .maybeSingle();
  if (storeError || !store) return json({ error: "store not found" }, 404);

  // 3) 국세청 진위확인
  const hometax = await fetchBusinessValidation(bizRegNumber, openDate, repName);

  // 4) 상호명 유사도(pg_trgm)
  const { data: similarityScore, error: similarityError } = await (admin.rpc as any)("name_similarity", {
    a: bizName,
    b: store.name,
  });
  if (similarityError) return json({ error: similarityError.message }, 500);

  const verdict = classifyVerification({
    hometaxValid: hometax.valid,
    businessStatus: hometax.businessStatusCode,
    nameSimilarityScore: similarityScore ?? 0,
  });

  // 5) 시도 로그 기록 (성공/실패 모두)
  await admin.from("store_owner_verification_attempts").insert({
    store_id: storeId,
    user_id: userId,
    business_reg_number: bizRegNumber,
    result: verdict.approved ? "approved" : "rejected",
    reject_reason: verdict.reason,
  });

  if (!verdict.approved) return json({ status: "rejected", reason: verdict.reason });

  // 6) 기존 소유자 확인 → 신규 승인 vs 소유권 충돌
  const { data: existingProfile } = await admin
    .from("store_owner_profiles")
    .select("owner_user_id")
    .eq("store_id", storeId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: insertError } = await admin
      .from("store_owner_profiles")
      .insert({ store_id: storeId, owner_user_id: userId });
    if (insertError) return json({ error: insertError.message }, 500);
    return json({ status: "approved" });
  }

  if (existingProfile.owner_user_id === userId) return json({ status: "already_owner" });

  // 소유권 충돌: 기존 pending 요청이 있으면 재사용, 없으면 새로 생성
  const { data: existingTransfer } = await admin
    .from("store_ownership_transfer_requests")
    .select("id")
    .eq("store_id", storeId)
    .eq("new_owner_user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingTransfer) {
    return json({ status: "transfer_pending", transferRequestId: existingTransfer.id });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: transferRequest, error: transferError } = await admin
    .from("store_ownership_transfer_requests")
    .insert({
      store_id: storeId,
      previous_owner_user_id: existingProfile.owner_user_id,
      new_owner_user_id: userId,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (transferError) return json({ error: transferError.message }, 500);

  return json({ status: "transfer_pending", transferRequestId: transferRequest.id });
});
```

- [ ] **Step 2: 로컬에서 실행 + curl 스모크 테스트**

Run: `npx supabase functions serve verify-store-owner --env-file supabase/.env.local`
(`supabase/.env.local`에 `NTS_API_SERVICE_KEY=<발급받은키>` 기록 — 이 파일은 `.gitignore`에 반드시 포함되어야 함, Task 7에서 확인)

Run (다른 터미널에서 — 로그인 안 한 요청):
```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/verify-store-owner \
  -H "Content-Type: application/json" \
  -d '{"storeId":"x","bizName":"x","bizRegNumber":"x","repName":"x","openDate":"x"}'
```
Expected: `401 {"error":"unauthorized"}` (Authorization 헤더 없음).

Run (로컬 테스트 유저로 로그인해서 발급받은 access_token 사용 — `npx supabase auth ...` 또는 앱에서 로그인 후 세션 토큰 확인):
```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/verify-store-owner \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"storeId":"<로컬 db의 실제 stores.id>","bizName":"테스트상회","bizRegNumber":"0000000000","repName":"테스트","openDate":"20200101"}'
```
Expected: 국세청 API 미설정/테스트 값이면 `500` 또는 `{"status":"rejected","reason":"hometax_mismatch"}` 등 — 500이 아닌 명확한 JSON 응답이 오면 인증/DB 배선은 정상. `store_owner_verification_attempts`에 시도 1건이 기록됐는지 psql로 확인.

- [ ] **Step 3: 커밋**

```bash
git add supabase/functions/verify-store-owner/index.ts
git commit -m "feat: verify-store-owner Edge Function 핸들러"
```

---

### Task 7: Edge Function 배포 + 시크릿 설정

**Files:**
- Modify: (없음, 운영 작업) — 필요 시 `.gitignore`에 `supabase/.env.local` 확인/추가

**Interfaces:**
- Consumes: Task 6의 `verify-store-owner` 함수.
- Produces: 원격 프로젝트에 배포된 `verify-store-owner`, 시크릿 `NTS_API_SERVICE_KEY`.

- [ ] **Step 1: `.gitignore`에 로컬 시크릿 파일이 이미 제외되는지 확인**

Run: `git check-ignore -v supabase/.env.local`
Expected: 매치되는 규칙이 출력됨(`.env*` 패턴이 이미 존재하는 것을 앞서 확인함 — 안 걸리면 이 Step에서 `.gitignore`에 `supabase/.env.local` 한 줄 추가 후 커밋).

- [ ] **Step 2: 원격 프로젝트에 시크릿 설정 + 배포**

Run:
```bash
npx supabase secrets set NTS_API_SERVICE_KEY=<발급받은키>
npx supabase functions deploy verify-store-owner
```
Expected: 배포 완료 메시지와 함수 URL 출력.

- [ ] **Step 3: 원격 배포본 스모크 테스트**

Run: Task 6 Step 2와 동일한 curl을 `http://127.0.0.1:54321` 대신 실제 프로젝트 URL(`https://<project-ref>.functions.supabase.co/verify-store-owner`)로 실행.
Expected: 로컬과 동일한 응답 형태(401 무인증, 이후 JSON 응답).

- [ ] **Step 4: 커밋 (설정 변경이 있었다면)**

```bash
git add .gitignore
git commit -m "chore: supabase 로컬 시크릿 파일 gitignore 확인"
```
(변경 사항이 없으면 이 Step은 스킵.)

---

### Task 8: `NTS_API_SETUP.md` 문서 (기존 `DATA_GO_KR_SETUP.md` 컨벤션 준용)

**Files:**
- Create: `NTS_API_SETUP.md`

**Interfaces:** 없음(문서).

- [ ] **Step 1: 문서 작성**

```markdown
# 국세청 사업자등록정보 진위확인 API 설정 가이드

판매점 사장님 인증(`supabase/functions/verify-store-owner`)에 사용하는 국세청 사업자등록정보
진위확인 API 설정 방법입니다. `DATA_GO_KR_SETUP.md`(온라인복권 배출점 API)와는 다른
API 게이트웨이(`api.odcloud.kr`)를 사용합니다.

## 개요

- 데이터셋: 국세청_사업자등록정보 진위확인 및 상태조회 서비스 (공공데이터포털, data.go.kr)
- 형식: JSON (POST)
- 비용: 무료
- 용도: 사장님이 타이핑 입력한 사업자등록번호+개업일자+대표자명이 국세청 등록 정보와
  일치하는지, 사업자 상태가 "계속사업자"인지 확인

## 설정 단계

1. 공공데이터포털(https://www.data.go.kr) 회원가입/로그인
2. "국세청_사업자등록정보 진위확인 및 상태조회 서비스" 검색 → 활용신청
3. 마이페이지 → API 이용현황에서 서비스키(디코딩 키) 확인
4. Edge Function 시크릿으로 등록:

   ```bash
   npx supabase secrets set NTS_API_SERVICE_KEY=발급받은키
   ```

## API 명세

### 요청

```
POST https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=<서비스키>
Content-Type: application/json

{
  "businesses": [
    { "b_no": "1234567890", "start_dt": "20210401", "p_nm": "홍길동" }
  ]
}
```

### 응답

```json
{
  "status_code": "OK",
  "data": [
    {
      "b_no": "1234567890",
      "valid": "01",
      "status": { "b_stt_cd": "01" }
    }
  ]
}
```

- `valid`: `"01"` = 일치, `"02"` = 확인불가
- `status.b_stt_cd`: `"01"` = 계속사업자, `"02"` = 휴업자, `"03"` = 폐업자

## 트러블슈팅

### 응답 필드가 문서와 다름

배포 전 `supabase/functions/verify-store-owner/hometax.ts` 하단 주석의 curl로 먼저 확인하고,
다르면 그 파일의 타입/매핑을 실제 응답에 맞게 수정한다.

### 429 / 호출 한도 초과

활용신청 승인 화면에 안내된 일일 호출 한도를 마이페이지에서 확인하고, 초과 시 대기 후 재시도.
```

- [ ] **Step 2: 커밋**

```bash
git add NTS_API_SETUP.md
git commit -m "docs: 국세청 사업자등록정보 진위확인 API 설정 가이드 추가"
```

---

## Phase 3 — 클라이언트 API + 순수 로직

### Task 9: 클라이언트 API 레이어 (`storeOwnerApi.ts`)

**Files:**
- Create: `src/features/storeOwner/api/storeOwnerApi.ts`

**Interfaces:**
- Consumes: `supabase`(`@/lib/supabase`), `Database`(`@/types/database.types`, Task 3).
- Produces: `type StoreOwnerProfile`, `type OwnershipTransferRequest`, `type VerifyStoreOwnerInput`, `type VerifyStoreOwnerResult`, `verifyStoreOwner(input): Promise<VerifyStoreOwnerResult>`, `getStoreOwnerProfile(storeId): Promise<StoreOwnerProfile | null>`, `updateOwnerProfile(storeId, updates): Promise<void>`, `getMyPendingTransfers(userId): Promise<OwnershipTransferRequest[]>`, `disputeOwnershipTransfer(requestId): Promise<void>`, `type OwnedStoreSummary`, `getMyOwnedStores(userId): Promise<OwnedStoreSummary[]>`.

- [ ] **Step 1: 파일 작성**

```ts
// src/features/storeOwner/api/storeOwnerApi.ts
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

export type StoreOwnerProfile = Database["public"]["Tables"]["store_owner_profiles"]["Row"];
export type OwnershipTransferRequest = Database["public"]["Tables"]["store_ownership_transfer_requests"]["Row"];

export interface VerifyStoreOwnerInput {
  storeId: string;
  bizName: string;
  bizRegNumber: string;
  repName: string;
  openDate: string; // YYYYMMDD
}

export type VerifyStoreOwnerResult =
  | { status: "approved" }
  | { status: "already_owner" }
  | { status: "transfer_pending"; transferRequestId: string }
  | { status: "rejected"; reason: "hometax_mismatch" | "business_closed" | "name_mismatch" }
  | { status: "locked"; unlockAt: string };

export async function verifyStoreOwner(input: VerifyStoreOwnerInput): Promise<VerifyStoreOwnerResult> {
  const { data, error } = await supabase.functions.invoke<VerifyStoreOwnerResult>("verify-store-owner", {
    body: input,
  });
  if (error) throw error;
  if (!data) throw new Error("빈 응답");
  return data;
}

export async function getStoreOwnerProfile(storeId: string): Promise<StoreOwnerProfile | null> {
  const { data, error } = await supabase
    .from("store_owner_profiles")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateOwnerProfile(
  storeId: string,
  updates: Pick<StoreOwnerProfile, "phone" | "business_hours" | "owner_message">,
): Promise<void> {
  const { error } = await supabase.from("store_owner_profiles").update(updates).eq("store_id", storeId);
  if (error) throw error;
}

export async function getMyPendingTransfers(userId: string): Promise<OwnershipTransferRequest[]> {
  const { data, error } = await supabase
    .from("store_ownership_transfer_requests")
    .select("*")
    .or(`previous_owner_user_id.eq.${userId},new_owner_user_id.eq.${userId}`)
    .in("status", ["pending", "disputed"]);
  if (error) throw error;
  return data ?? [];
}

export async function disputeOwnershipTransfer(requestId: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("dispute_ownership_transfer", { p_request_id: requestId });
  if (error) throw error;
}

export interface OwnedStoreSummary {
  storeId: string;
  name: string;
  address: string;
}

export async function getMyOwnedStores(userId: string): Promise<OwnedStoreSummary[]> {
  const { data: profiles, error: profilesError } = await supabase
    .from("store_owner_profiles")
    .select("store_id")
    .eq("owner_user_id", userId);
  if (profilesError) throw profilesError;

  const storeIds = (profiles ?? []).map((p) => p.store_id);
  if (storeIds.length === 0) return [];

  const { data: stores, error: storesError } = await supabase
    .from("stores")
    .select("id, name, address")
    .in("id", storeIds);
  if (storesError) throw storesError;

  return (stores ?? []).map((s) => ({ storeId: s.id, name: s.name, address: s.address }));
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/features/storeOwner/api/storeOwnerApi.ts
git commit -m "feat: storeOwner 클라이언트 API 레이어"
```

---

### Task 10: 표시용 순수 로직 (`resolveDisplayInfo.ts`) + Jest 테스트

**Files:**
- Create: `src/features/storeOwner/resolveDisplayInfo.ts`
- Test: `src/features/storeOwner/resolveDisplayInfo.test.ts`

**Interfaces:**
- Produces: `resolvePhone(ownerPhone, storePhone): string | undefined`, `resolveOwnerMessage(ownerMessage): string | null`, `daysUntilExpiry(expiresAt, now?): number`.
- Consumes: 없음(순수 함수).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/features/storeOwner/resolveDisplayInfo.test.ts
import { resolvePhone, resolveOwnerMessage, daysUntilExpiry } from "./resolveDisplayInfo";

describe("resolvePhone", () => {
  it("사장님이 입력한 전화번호가 있으면 우선 사용", () => {
    expect(resolvePhone("010-1111-2222", "02-333-4444")).toBe("010-1111-2222");
  });
  it("사장님 입력이 없으면(null) 공공데이터 값으로 폴백", () => {
    expect(resolvePhone(null, "02-333-4444")).toBe("02-333-4444");
  });
  it("사장님 입력이 빈 문자열이면 폴백", () => {
    expect(resolvePhone("  ", "02-333-4444")).toBe("02-333-4444");
  });
  it("둘 다 없으면 undefined", () => {
    expect(resolvePhone(null, null)).toBeUndefined();
  });
});

describe("resolveOwnerMessage", () => {
  it("공백만 있으면 null", () => {
    expect(resolveOwnerMessage("   ")).toBeNull();
  });
  it("내용이 있으면 그대로 반환", () => {
    expect(resolveOwnerMessage("항상 친절하게 모시겠습니다")).toBe("항상 친절하게 모시겠습니다");
  });
});

describe("daysUntilExpiry", () => {
  it("정확히 7일 남았으면 7", () => {
    const now = new Date("2026-08-12T00:00:00Z");
    const expiresAt = new Date("2026-08-19T00:00:00Z").toISOString();
    expect(daysUntilExpiry(expiresAt, now)).toBe(7);
  });
  it("이미 지났으면 0(음수 금지)", () => {
    const now = new Date("2026-08-20T00:00:00Z");
    const expiresAt = new Date("2026-08-19T00:00:00Z").toISOString();
    expect(daysUntilExpiry(expiresAt, now)).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest src/features/storeOwner/resolveDisplayInfo.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// src/features/storeOwner/resolveDisplayInfo.ts
export function resolvePhone(
  ownerPhone: string | null | undefined,
  storePhone: string | null | undefined,
): string | undefined {
  if (ownerPhone?.trim()) return ownerPhone;
  return storePhone ?? undefined;
}

export function resolveOwnerMessage(ownerMessage: string | null | undefined): string | null {
  return ownerMessage?.trim() ? ownerMessage : null;
}

export function daysUntilExpiry(expiresAt: string, now: Date = new Date()): number {
  const diffMs = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx jest src/features/storeOwner/resolveDisplayInfo.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/features/storeOwner/resolveDisplayInfo.ts src/features/storeOwner/resolveDisplayInfo.test.ts
git commit -m "feat: 사장님 정보 표시(폴백/D-day) 순수 로직 + 유닛 테스트"
```

---

### Task 11: `useMyPendingTransfers` 훅

**Files:**
- Create: `src/features/storeOwner/useMyPendingTransfers.ts`

**Interfaces:**
- Consumes: `useAuth`(`@/features/auth/useAuth`), `getMyPendingTransfers`(Task 9).
- Produces: `useMyPendingTransfers(): UseQueryResult<OwnershipTransferRequest[]>` — `queryKey: ["store-owner", "pending-transfers", userId]`.

- [ ] **Step 1: 파일 작성**

```ts
// src/features/storeOwner/useMyPendingTransfers.ts
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { getMyPendingTransfers } from "./api/storeOwnerApi";

export function useMyPendingTransfers() {
  const userId = useAuth((s) => s.user?.id);
  return useQuery({
    queryKey: ["store-owner", "pending-transfers", userId],
    queryFn: () => getMyPendingTransfers(userId!),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/features/storeOwner/useMyPendingTransfers.ts
git commit -m "feat: 내 소유권 이전 대기 목록 조회 훅"
```

---

### Task 12: `OwnershipTransferBanner` 컴포넌트

**Files:**
- Create: `src/features/storeOwner/components/OwnershipTransferBanner.tsx`

**Interfaces:**
- Consumes: `useMyPendingTransfers`(Task 11), `useAuth`(`@/features/auth/useAuth`), `disputeOwnershipTransfer`(Task 9), `daysUntilExpiry`(Task 10), `colors`/`spacing`/`radius`(`@/constants/theme`).
- Produces: `<OwnershipTransferBanner storeId={string} />` — 해당 매장에 대해 로그인 사용자가 당사자인 `pending`/`disputed` 요청이 있을 때만 렌더링, 없으면 `null`.

- [ ] **Step 1: 파일 작성**

```tsx
// src/features/storeOwner/components/OwnershipTransferBanner.tsx
import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useMyPendingTransfers } from "../useMyPendingTransfers";
import { disputeOwnershipTransfer } from "../api/storeOwnerApi";
import { daysUntilExpiry } from "../resolveDisplayInfo";
import { colors, spacing, radius } from "@/constants/theme";

export function OwnershipTransferBanner({ storeId }: { storeId: string }) {
  const userId = useAuth((s) => s.user?.id);
  const { data: transfers } = useMyPendingTransfers();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const transfer = transfers?.find((t) => t.store_id === storeId);

  const handleDispute = useCallback(() => {
    if (!transfer) return;
    Alert.alert("이의 제기", "이 매장의 소유권 이전 신청에 이의를 제기하시겠습니까? 관리자가 확인합니다.", [
      { text: "취소", style: "cancel" },
      {
        text: "이의 제기",
        style: "destructive",
        onPress: async () => {
          setSubmitting(true);
          try {
            await disputeOwnershipTransfer(transfer.id);
            queryClient.invalidateQueries({ queryKey: ["store-owner", "pending-transfers"] });
          } catch (err) {
            Alert.alert("오류", "이의 제기에 실패했습니다. 잠시 후 다시 시도해주세요.");
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }, [transfer, queryClient]);

  if (!transfer || !userId) return null;

  const isPreviousOwner = transfer.previous_owner_user_id === userId;
  const daysLeft = daysUntilExpiry(transfer.expires_at);

  let message: string;
  if (transfer.status === "disputed") {
    message = "이의 제기가 접수되어 관리자가 확인 중입니다.";
  } else if (isPreviousOwner) {
    message = `다른 신청자가 이 매장 사장님으로 재신청했습니다. 이의가 없으면 ${daysLeft}일 후 자동으로 소유권이 이전됩니다.`;
  } else {
    message = `인증은 통과했습니다. 기존 사장님의 이의제기가 없으면 ${daysLeft}일 후 자동으로 승인됩니다.`;
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{message}</Text>
      {isPreviousOwner && transfer.status === "pending" && (
        <Pressable style={styles.disputeButton} onPress={handleDispute} disabled={submitting}>
          {submitting ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.disputeButtonText}>이의 제기</Text>}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  text: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  disputeButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
  },
  disputeButtonText: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/features/storeOwner/components/OwnershipTransferBanner.tsx
git commit -m "feat: 소유권 이전 대기 배너 컴포넌트"
```

---

## Phase 4 — 화면 및 기존 화면 통합

### Task 13: 사장님 인증 신청 화면 (`app/store-owner/signup.tsx`)

**Files:**
- Create: `app/store-owner/signup.tsx`

**Interfaces:**
- Consumes: `useAuth`(`signIn`, `signUp`, `user` — `@/features/auth/useAuth`), `searchStores`, `type StoreSearchResult`(`@/features/stores/api/storesApi`, 기존 검색 로직 재사용), `verifyStoreOwner`(Task 9), `useLocalSearchParams`, `useRouter`(`expo-router`).
- Produces: 라우트 `/store-owner/signup` (query param `storeId?: string` — `app/store/[id].tsx`에서 특정 매장을 미리 선택해 진입할 때 사용).

- [ ] **Step 1: 파일 작성**

```tsx
// app/store-owner/signup.tsx
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/features/auth/useAuth";
import { searchStores, type StoreSearchResult } from "@/features/stores/api/storesApi";
import { verifyStoreOwner } from "@/features/storeOwner/api/storeOwnerApi";
import { colors, spacing, radius } from "@/constants/theme";

export default function StoreOwnerSignupScreen() {
  const router = useRouter();
  const { storeId: prefilledStoreId } = useLocalSearchParams<{ storeId?: string }>();
  const user = useAuth((s) => s.user);
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StoreSearchResult[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreSearchResult | null>(null);

  const [bizName, setBizName] = useState("");
  const [bizRegNumber, setBizRegNumber] = useState("");
  const [repName, setRepName] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefilledStoreId) return;
    // storeId만 있고 이름/주소가 없으면 검색 결과 선택 단계는 스킵하지 않고, 검색창에
    // 미리 채워두는 정도로만 돕는다(정확한 매장 객체는 사용자가 검색·선택해야 함).
  }, [prefilledStoreId]);

  const handleSearch = useCallback(async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await searchStores(text);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
  }, []);

  const handleAuthSubmit = useCallback(
    async (mode: "signup" | "signin") => {
      if (!email || !password) return;
      setAuthSubmitting(true);
      setAuthError(null);
      const { error } = mode === "signup" ? await signUp(email, password) : await signIn(email, password);
      setAuthSubmitting(false);
      if (error) setAuthError(error);
    },
    [email, password, signIn, signUp],
  );

  const rejectReasonText: Record<string, string> = {
    hometax_mismatch: "국세청에 등록된 사업자정보와 일치하지 않습니다. 사업자등록번호/개업일자/대표자명을 다시 확인해주세요.",
    business_closed: "휴업 또는 폐업 상태의 사업자로 확인됩니다.",
    name_mismatch: "입력하신 상호명이 선택하신 매장 정보와 너무 다릅니다. 매장을 다시 선택하거나 상호명을 확인해주세요.",
  };

  const handleVerifySubmit = useCallback(async () => {
    if (!selectedStore || !bizName || !bizRegNumber || !repName || !openDate) return;
    setVerifySubmitting(true);
    setVerifyError(null);
    try {
      const result = await verifyStoreOwner({
        storeId: selectedStore.id,
        bizName,
        bizRegNumber,
        repName,
        openDate,
      });
      if (result.status === "approved" || result.status === "already_owner") {
        Alert.alert("인증 완료", "사장님 인증이 완료되었습니다. 이제 매장 정보를 수정할 수 있어요.", [
          { text: "확인", onPress: () => router.replace(`/store-owner/manage?storeId=${selectedStore.id}`) },
        ]);
      } else if (result.status === "transfer_pending") {
        Alert.alert(
          "인증 통과",
          "인증은 통과했습니다. 기존 사장님의 이의제기가 없으면 7일 후 자동으로 사장님 권한이 부여됩니다.",
          [{ text: "확인", onPress: () => router.back() }],
        );
      } else if (result.status === "rejected") {
        setVerifyError(rejectReasonText[result.reason] ?? "인증에 실패했습니다. 다시 시도해주세요.");
      } else if (result.status === "locked") {
        const unlockTime = new Date(result.unlockAt).toLocaleString("ko-KR");
        setVerifyError(`인증 시도가 너무 많이 실패했습니다. ${unlockTime} 이후 다시 시도해주세요.`);
      }
    } catch {
      setVerifyError("인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setVerifySubmitting(false);
    }
  }, [selectedStore, bizName, bizRegNumber, repName, openDate, router]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>복권 판매점 사장님 인증</Text>
        <Text style={styles.subtitle}>
          사업자 정보를 입력하시면 국세청 확인을 거쳐 매장 정보를 직접 수정하실 수 있어요.
        </Text>

        {!user && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>계정</Text>
            <TextInput
              style={styles.input}
              placeholder="이메일"
              placeholderTextColor="#999"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="비밀번호"
              placeholderTextColor="#999"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {authError && <Text style={styles.errorText}>{authError}</Text>}
            <View style={styles.authButtonRow}>
              <Pressable style={styles.secondaryButton} onPress={() => handleAuthSubmit("signin")} disabled={authSubmitting}>
                <Text style={styles.secondaryButtonText}>이미 계정 있어요</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => handleAuthSubmit("signup")} disabled={authSubmitting}>
                {authSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>처음이에요(가입)</Text>}
              </Pressable>
            </View>
          </View>
        )}

        {user && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>내 매장 찾기</Text>
              {selectedStore ? (
                <View style={styles.selectedStoreCard}>
                  <Text style={styles.selectedStoreName}>{selectedStore.name}</Text>
                  <Text style={styles.selectedStoreAddress}>{selectedStore.address}</Text>
                  <Pressable onPress={() => setSelectedStore(null)}>
                    <Text style={styles.changeStoreText}>다시 검색</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="매장명 또는 주소로 검색"
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={handleSearch}
                  />
                  {searchResults.map((store) => (
                    <Pressable key={store.id} style={styles.searchResultRow} onPress={() => setSelectedStore(store)}>
                      <Text style={styles.searchResultName}>{store.name}</Text>
                      <Text style={styles.searchResultAddress}>{store.address}</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </View>

            {selectedStore && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>사업자 정보</Text>
                <TextInput
                  style={styles.input}
                  placeholder="상호명 (사업자등록증 상 상호)"
                  placeholderTextColor="#999"
                  value={bizName}
                  onChangeText={setBizName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="사업자등록번호 (숫자 10자리)"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  value={bizRegNumber}
                  onChangeText={setBizRegNumber}
                />
                <TextInput
                  style={styles.input}
                  placeholder="대표자명"
                  placeholderTextColor="#999"
                  value={repName}
                  onChangeText={setRepName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="개업일자 (YYYYMMDD, 예: 20210401)"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  value={openDate}
                  onChangeText={setOpenDate}
                />
                {verifyError && <Text style={styles.errorText}>{verifyError}</Text>}
                <Pressable
                  style={styles.primaryButton}
                  onPress={handleVerifySubmit}
                  disabled={verifySubmitting || !bizName || !bizRegNumber || !repName || openDate.length !== 8}
                >
                  {verifySubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>인증 신청</Text>}
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  section: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.textPrimary,
  },
  errorText: { fontSize: 12, color: "#FF3B30" },
  authButtonRow: { flexDirection: "row", gap: spacing.sm },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  selectedStoreCard: { backgroundColor: colors.background, borderRadius: radius.sm, padding: spacing.md, gap: 4 },
  selectedStoreName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  selectedStoreAddress: { fontSize: 12, color: colors.textSecondary },
  changeStoreText: { fontSize: 12, color: colors.primary, marginTop: spacing.xs },
  searchResultRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchResultName: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  searchResultAddress: { fontSize: 12, color: colors.textSecondary },
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/store-owner/signup.tsx
git commit -m "feat: 사장님 인증 신청 화면"
```

---

### Task 14: 내 매장 관리 화면 (`app/store-owner/manage.tsx`)

**Files:**
- Create: `app/store-owner/manage.tsx`

**Interfaces:**
- Consumes: `useAuth`(`@/features/auth/useAuth`), `getMyOwnedStores`, `getStoreOwnerProfile`, `updateOwnerProfile`(Task 9), `useLocalSearchParams`.
- Produces: 라우트 `/store-owner/manage?storeId?` — `storeId` 없으면 소유 매장 목록 → 선택 시 수정 폼, 있으면 바로 수정 폼.

- [ ] **Step 1: 파일 작성**

```tsx
// app/store-owner/manage.tsx
import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/features/auth/useAuth";
import {
  getMyOwnedStores,
  getStoreOwnerProfile,
  updateOwnerProfile,
  type OwnedStoreSummary,
  type StoreOwnerProfile,
} from "@/features/storeOwner/api/storeOwnerApi";
import { colors, spacing, radius } from "@/constants/theme";

export default function StoreOwnerManageScreen() {
  const router = useRouter();
  const { storeId: paramStoreId } = useLocalSearchParams<{ storeId?: string }>();
  const userId = useAuth((s) => s.user?.id);

  const [loading, setLoading] = useState(true);
  const [ownedStores, setOwnedStores] = useState<OwnedStoreSummary[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(paramStoreId ?? null);
  const [profile, setProfile] = useState<StoreOwnerProfile | null>(null);

  const [phone, setPhone] = useState("");
  const [businessHours, setBusinessHours] = useState("");
  const [ownerMessage, setOwnerMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getMyOwnedStores(userId)
      .then(setOwnedStores)
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!activeStoreId) return;
    getStoreOwnerProfile(activeStoreId).then((p) => {
      setProfile(p);
      setPhone(p?.phone ?? "");
      setBusinessHours(p?.business_hours ?? "");
      setOwnerMessage(p?.owner_message ?? "");
    });
  }, [activeStoreId]);

  const handleSave = useCallback(async () => {
    if (!activeStoreId) return;
    if (ownerMessage.length > 100) {
      Alert.alert("입력 오류", "한마디는 최대 100자까지 입력할 수 있어요.");
      return;
    }
    setSubmitting(true);
    try {
      await updateOwnerProfile(activeStoreId, {
        phone: phone || null,
        business_hours: businessHours || null,
        owner_message: ownerMessage || null,
      });
      Alert.alert("저장 완료", "매장 정보가 저장되었습니다.");
    } catch {
      Alert.alert("오류", "저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [activeStoreId, phone, businessHours, ownerMessage]);

  if (!userId) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>로그인이 필요합니다.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!activeStoreId) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>내 매장 관리</Text>
        {ownedStores.length === 0 ? (
          <Text style={styles.emptyText}>
            아직 인증된 매장이 없어요. 매장 상세 화면에서 "사장님이신가요?"를 눌러 인증을 신청해보세요.
          </Text>
        ) : (
          ownedStores.map((store) => (
            <Pressable key={store.storeId} style={styles.storeRow} onPress={() => setActiveStoreId(store.storeId)}>
              <Text style={styles.storeRowName}>{store.name}</Text>
              <Text style={styles.storeRowAddress}>{store.address}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>매장 정보 수정</Text>
      {profile?.owner_user_id !== userId ? (
        <Text style={styles.emptyText}>이 매장의 사장님 권한이 없습니다.</Text>
      ) : (
        <View style={styles.section}>
          <Text style={styles.label}>전화번호</Text>
          <TextInput
            style={styles.input}
            placeholder="02-1234-5678"
            placeholderTextColor="#999"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Text style={styles.label}>영업시간</Text>
          <TextInput
            style={styles.input}
            placeholder="예: 매일 09:00~23:00"
            placeholderTextColor="#999"
            value={businessHours}
            onChangeText={setBusinessHours}
          />
          <Text style={styles.label}>한마디 ({ownerMessage.length}/100)</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            placeholder="손님들께 전하고 싶은 한마디"
            placeholderTextColor="#999"
            multiline
            maxLength={100}
            value={ownerMessage}
            onChangeText={setOwnerMessage}
          />
          <Pressable style={styles.primaryButton} onPress={handleSave} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>저장</Text>}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  section: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  label: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.textPrimary,
  },
  messageInput: { minHeight: 70, textAlignVertical: "top" },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  storeRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  storeRowName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  storeRowAddress: { fontSize: 12, color: colors.textSecondary },
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/store-owner/manage.tsx
git commit -m "feat: 내 매장 관리(정보 수정) 화면"
```

---

### Task 15: `app/store/[id].tsx` 통합 — 사장님 정보 오버레이 + CTA + 배너

**Files:**
- Modify: `app/store/[id].tsx`

**Interfaces:**
- Consumes: `getStoreOwnerProfile`(Task 9), `resolvePhone`/`resolveOwnerMessage`(Task 10), `OwnershipTransferBanner`(Task 12), 기존 `useAuth`, `useRouter`(`expo-router`, 신규 import), 기존 `summarizeBusinessHours`.

- [ ] **Step 1: import 추가 및 owner profile 쿼리 추가**

`app/store/[id].tsx` 상단 import 블록(1~33행)에 추가:

```tsx
import { useRouter } from "expo-router";
import { getStoreOwnerProfile } from "@/features/storeOwner/api/storeOwnerApi";
import { resolvePhone, resolveOwnerMessage } from "@/features/storeOwner/resolveDisplayInfo";
import { OwnershipTransferBanner } from "@/features/storeOwner/components/OwnershipTransferBanner";
```

`useLocalSearchParams` 바로 아래(104행 부근)에 `router` 선언과 owner profile 쿼리 추가:

```tsx
  const router = useRouter();
```

기존 `winnings` 쿼리(116~122행) 바로 아래에 추가:

```tsx
  const { data: ownerProfile } = useQuery({
    queryKey: ["store", id, "owner-profile"],
    queryFn: () => getStoreOwnerProfile(id!),
    staleTime: 60 * 1000,
    enabled: !!id,
  });
```

- [ ] **Step 2: `formattedPhone` 계산을 오버레이 반영하도록 수정**

기존(183행):
```tsx
  const formattedPhone = formatPhoneNumber(stats?.phone);
```
변경 후:
```tsx
  const formattedPhone = formatPhoneNumber(resolvePhone(ownerProfile?.phone, stats?.phone));
  const ownerMessage = resolveOwnerMessage(ownerProfile?.owner_message);
  const ownerBusinessHoursText = ownerProfile?.business_hours?.trim();
  const isOwner = !!userId && ownerProfile?.owner_user_id === userId;
```

- [ ] **Step 3: 영업시간 섹션(339~347행)을 사장님 입력 우선으로 교체**

기존:
```tsx
      {/* 영업시간 */}
      {(stats as any).business_hours && (
        <View style={styles.businessHoursSection}>
          <Text style={styles.sectionTitle}>영업시간</Text>
          <Text style={styles.businessHoursSummary}>
            {summarizeBusinessHours((stats as any).business_hours as Record<string, string>)}
          </Text>
        </View>
      )}
```
변경 후:
```tsx
      {/* 영업시간: 사장님이 직접 입력한 값이 있으면 우선 표시, 없으면 공공데이터 값으로 폴백 */}
      {(ownerBusinessHoursText || (stats as any).business_hours) && (
        <View style={styles.businessHoursSection}>
          <Text style={styles.sectionTitle}>영업시간</Text>
          <Text style={styles.businessHoursSummary}>
            {ownerBusinessHoursText || summarizeBusinessHours((stats as any).business_hours as Record<string, string>)}
          </Text>
        </View>
      )}

      {/* 사장님 한마디 */}
      {ownerMessage && (
        <View style={styles.businessHoursSection}>
          <Text style={styles.sectionTitle}>사장님 한마디</Text>
          <Text style={styles.businessHoursSummary}>💬 {ownerMessage}</Text>
        </View>
      )}

      {/* 소유권 이전 대기 배너 */}
      <OwnershipTransferBanner storeId={id!} />

      {/* 사장님 인증/관리 CTA */}
      <Pressable
        style={styles.ownerCtaRow}
        onPress={() =>
          isOwner
            ? router.push(`/store-owner/manage?storeId=${id}`)
            : router.push(`/store-owner/signup?storeId=${id}`)
        }
      >
        <Text style={styles.ownerCtaText}>
          {isOwner ? "🔧 매장 정보 수정하기" : "🏪 이 매장 사장님이신가요? 인증하고 정보 수정하기"}
        </Text>
      </Pressable>
```

- [ ] **Step 4: 스타일 추가**

`styles` 객체(448행부터) 끝 부분(`businessHoursSummary` 다음)에 추가:

```tsx
  ownerCtaRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ownerCtaText: { fontSize: 13, fontWeight: "600", color: colors.primary, textAlign: "center" },
```

- [ ] **Step 5: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 6: 수동 확인**

Run: `npm start` 후 Expo Go/시뮬레이터에서 임의의 매장 상세 화면 진입.
Expected: 기존 화면이 그대로 보이고, 하단에 "이 매장 사장님이신가요?" CTA가 추가로 보인다. 사장님 정보가 아직 없는 매장이므로 영업시간/한마디/배너는 변화 없음(기존 stores.business_hours 요약이 그대로 표시됨 — 회귀 없음 확인).

- [ ] **Step 7: 커밋**

```bash
git add app/store/[id].tsx
git commit -m "feat: 매장 상세 화면에 사장님 정보 오버레이/CTA/이전 배너 통합"
```

---

### Task 16: `settings.tsx` 진입점 추가

**Files:**
- Modify: `app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: `useRouter`(`expo-router`, 신규 import).

- [ ] **Step 1: import 추가**

파일 상단(14행 `useRouter` import 아래)에 추가할 것은 없음 — `expo-router`에서 `useRouter`만 추가로 가져온다. 기존:
```tsx
import { useRouter } from "expo-router";
```
(이미 있으면 스킵 — 없으면 추가)

- [ ] **Step 2: 항상 보이는 진입점 섹션 추가**

"알림" 섹션(149~154행) 바로 아래, "계정" 섹션 위에 삽입:

```tsx
      {/* 판매점 사장님 진입점 - 숨겨진 관리자 제스처와 달리 누구나 볼 수 있다 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>판매점 사장님이신가요?</Text>
        <Pressable style={styles.linkRow} onPress={() => router.push("/store-owner/signup")}>
          <Text style={styles.linkRowText}>매장 인증하고 정보 수정하기</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push("/store-owner/manage")}>
          <Text style={styles.linkRowText}>내 매장 관리</Text>
        </Pressable>
      </View>
```

`SettingsScreen` 함수 상단에 `const router = useRouter();`가 이미 선언되어 있음(30행) — 재사용.

- [ ] **Step 3: 타입체크 + 수동 확인**

Run: `npm run typecheck`
Expected: 에러 없음.

Run: `npm start` → 설정 탭 진입.
Expected: 로그인 여부와 무관하게 "판매점 사장님이신가요?" 섹션이 항상 보이고, 각 버튼이 해당 라우트로 이동한다.

- [ ] **Step 4: 커밋**

```bash
git add "app/(tabs)/settings.tsx"
git commit -m "feat: 설정 화면에 사장님 인증/매장 관리 진입점 추가"
```

---

### Task 17: 관리자 페이지 — 이의제기 큐

**Files:**
- Modify: `src/features/admin/api/adminApi.ts`
- Modify: `app/admin.tsx`

**Interfaces:**
- Produces: `getDisputedTransfers(): Promise<DisputedTransfer[]>`, `resolveDisputedTransfer(requestId: string, approve: boolean): Promise<void>` (in `adminApi.ts`).
- Consumes: RPC `admin_disputed_transfers`, `resolve_disputed_transfer`(Task 1).

- [ ] **Step 1: `adminApi.ts`에 함수 추가**

파일 끝(`getAdminOverview` 함수 뒤)에 추가:

```ts
export interface DisputedTransfer {
  id: string;
  store_id: string;
  store_name: string;
  previous_owner_email: string;
  new_owner_email: string;
  requested_at: string;
  expires_at: string;
}

export async function getDisputedTransfers(): Promise<DisputedTransfer[]> {
  const { data, error } = await (supabase.rpc as any)("admin_disputed_transfers");
  if (error) throw error;
  return (data ?? []) as DisputedTransfer[];
}

export async function resolveDisputedTransfer(requestId: string, approve: boolean): Promise<void> {
  const { error } = await (supabase.rpc as any)("resolve_disputed_transfer", {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: `app/admin.tsx`에 이의제기 큐 섹션 추가**

import 블록(1~8행)에 추가:
```tsx
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getDisputedTransfers, resolveDisputedTransfer } from "@/features/admin/api/adminApi";
```
(`useMemo`는 이미 import되어 있으므로 `useCallback`만 추가)

`AdminScreen` 함수 내부, 기존 `data` 쿼리(30~35행) 바로 아래에 쿼리 + 핸들러 추가:

```tsx
  const queryClient = useQueryClient();
  const { data: disputedTransfers } = useQuery({
    queryKey: ["admin", "disputed-transfers"],
    queryFn: getDisputedTransfers,
    enabled: isAdmin,
    staleTime: 30 * 1000,
  });

  const handleResolve = useCallback(
    async (requestId: string, approve: boolean) => {
      await resolveDisputedTransfer(requestId, approve);
      queryClient.invalidateQueries({ queryKey: ["admin", "disputed-transfers"] });
    },
    [queryClient],
  );
```

기존 마지막 섹션("최근 7일 오류", 105~117행) 바로 아래에 새 섹션 추가:

```tsx
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>소유권 이전 이의제기</Text>
        {!disputedTransfers || disputedTransfers.length === 0 ? (
          <Text style={styles.emptyText}>대기 중인 이의제기가 없습니다.</Text>
        ) : (
          disputedTransfers.map((t) => (
            <View key={t.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{t.store_name}</Text>
                <Text style={styles.rowValue}>{t.previous_owner_email} → {t.new_owner_email}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => handleResolve(t.id, false)}>
                  <Text style={{ color: "#FF3B30", fontWeight: "700" }}>거절</Text>
                </Pressable>
                <Pressable onPress={() => handleResolve(t.id, true)}>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>승인</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
```

`Pressable`은 `react-native` import에 추가 필요 — 기존 import(2행)에 `Pressable` 추가.

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 4: 수동 확인**

Run: 로컬 DB에 `store_ownership_transfer_requests` 더미 행(`status='disputed'`)을 psql로 삽입 후, 설정 화면 버전 5탭 → 관리자 로그인 → `/admin` 진입.
Expected: "소유권 이전 이의제기" 섹션에 더미 건이 보이고, "승인"/"거절" 클릭 시 목록에서 사라짐(재조회로 상태 갱신 확인). psql로 `store_ownership_transfer_requests.status`가 `admin_approved`/`admin_rejected`로 바뀌었는지, 승인한 경우 `store_owner_profiles.owner_user_id`가 바뀌었는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/features/admin/api/adminApi.ts app/admin.tsx
git commit -m "feat: 관리자 페이지에 소유권 이전 이의제기 큐 추가"
```

---

## Post-Implementation (코드 아님 — 설계 문서의 후속 작업)

구현 완료 후, 설계 문서(`docs/superpowers/specs/2026-08-12-store-owner-verification-design.md`)의 "비용 검토" 섹션대로 다음을 실측한다(별도 작업, 이 계획의 범위 아님):
- `store_owner_profiles`/`store_owner_verification_attempts`/`store_ownership_transfer_requests`의 실제 row 증가 추이
- `verify-store-owner` Edge Function 호출량과 Supabase Edge Function 무료 티어 한도 대비 여유
- 국세청 API 실제 일일 호출 한도와 여유
- pg_cron 스케줄이 예상대로 매일 실행되는지 (`select * from cron.job_run_details order by start_time desc limit 20;`으로 확인)

---

## Self-Review

**Spec coverage:** 신규 인증 흐름(잠금 포함) → Task 1, 4, 5, 6, 13. 소유권 충돌/7일 대기/양방향 대칭 → Task 1(양쪽 재인증 시 동일 코드 경로가 재사용됨), 2, 12, 17. 정보 수정(전화/영업시간/한마디, 100자 이중 검증) → Task 1(check 제약), 14(maxLength). RLS(공개 읽기, 컬럼 단위 잠금, service-role 전용 이관) → Task 1. 비용/유지비(신규 의존성 없음, pg_cron 판단 근거) → Task 2. 국세청 API 실제 스펙 → Task 5, 8. 기존 코드 통합(`useAuth`, `app/store/[id].tsx`, `app/admin.tsx`) → Task 13, 15, 16, 17. 모두 커버됨.

**Placeholder scan:** 모든 Step에 실제 코드/명령어 포함, "TODO"/"add validation" 류 문구 없음.

**Type consistency:** `VerifyStoreOwnerResult`(Task 9)와 `verify-store-owner`의 응답 형태(Task 6)가 동일한 5가지 status 유니온을 사용하도록 맞춤. `StoreOwnerProfile`/`OwnershipTransferRequest` 타입은 Task 3의 `database.types.ts` 정의를 Task 9~17 전체가 동일하게 참조. `daysUntilExpiry`/`resolvePhone`/`resolveOwnerMessage`(Task 10)는 Task 12, 15에서 동일 시그니처로 사용됨.
