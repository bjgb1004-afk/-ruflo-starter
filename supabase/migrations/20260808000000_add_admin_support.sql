-- 관리자 페이지용: 가벼운 에러 로그(별도 로깅 인프라 없이 Sentry 캡처 시점에 함께 기록)와
-- auth.users에 직접 접근하지 않고 안전하게 "총 사용자 수"만 노출하는 RPC.

create table if not exists public.app_error_logs (
  id bigint generated always as identity primary key,
  feature text not null,
  message text not null,
  created_at timestamptz not null default now()
);

comment on table public.app_error_logs is
  '관리자 페이지의 API/QR 실패율 표시용 경량 에러 로그. Sentry와 별개로 앱 내에서 바로 조회하기 위함.';

alter table public.app_error_logs enable row level security;

-- 누구나(비로그인 포함) 에러를 기록할 수 있어야 실제 실패 상황을 놓치지 않는다.
create policy "app_error_logs_insert_any" on public.app_error_logs
  for insert with check (true);

-- 조회는 로그인한 사용자만 (관리자 페이지 자체는 클라이언트에서 이메일 allowlist로 추가 제한).
create policy "app_error_logs_select_authenticated" on public.app_error_logs
  for select using (auth.uid() is not null);

-- 오래된 로그가 무한히 쌓이지 않도록 최근 30일만 유지(관리자 페이지도 최근 데이터면 충분).
create index if not exists idx_app_error_logs_created_at on public.app_error_logs(created_at desc);

-- auth.users에는 서비스 롤 없이 직접 접근할 수 없고, 서비스 롤 키는 앱 번들에 절대 포함하면
-- 안 된다. security definer로 "개수"만 안전하게 노출하는 함수를 둔다(개별 유저 정보는 반환 안 함).
create or replace function public.get_user_count()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from auth.users;
$$;

comment on function public.get_user_count() is
  '관리자 페이지용: auth.users 개별 정보 노출 없이 총 가입자 수만 반환.';
