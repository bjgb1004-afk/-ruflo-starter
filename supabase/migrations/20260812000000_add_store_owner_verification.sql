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
  has_parking    boolean,
  has_restroom   boolean,
  has_atm        boolean,
  amenities      text[],
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
grant update (phone, business_hours, owner_message, has_parking, has_restroom, has_atm, amenities) on public.store_owner_profiles to authenticated;

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
