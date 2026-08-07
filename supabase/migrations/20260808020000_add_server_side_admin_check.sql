-- 이전 구현은 관리자 판별을 클라이언트(ADMIN_EMAILS 배열)에서만 했다. app_error_logs
-- select 정책은 "로그인만 하면"(auth.uid() is not null) 통과였기 때문에, 일반 로그인
-- 사용자가 앱을 거치지 않고 Supabase 클라이언트로 직접 호출하면 관리자 화면 없이도
-- 에러 로그를 읽을 수 있었다. 관리자 목록을 서버(테이블)에 두고, 실제 권한 검증을
-- 서버 함수/RLS에서 하도록 바꾼다.

create table if not exists public.admin_emails (
  email text primary key
);

comment on table public.admin_emails is
  '관리자 페이지 접근 허용 이메일. 클라이언트 ADMIN_EMAILS는 UI 표시용 편의 게이트일 뿐이고,
   실제 권한 검증은 이 테이블 기준의 is_admin()으로 서버에서 이뤄진다.';

-- 이 테이블 자체는 아무도 직접 select/insert 못하게 막는다(정보 자체가 민감할 건 없지만,
-- 관리자 이메일 목록 노출을 막기 위해 기본적으로 잠가둔다). 편집은 Dashboard(서비스 롤)에서만.
alter table public.admin_emails enable row level security;

insert into public.admin_emails (email) values ('bjgb1004@gmail.com')
  on conflict (email) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_emails
    where email = (auth.jwt() ->> 'email')
  );
$$;

comment on function public.is_admin() is
  '현재 로그인한 사용자(auth.jwt() 이메일)가 admin_emails에 있는지 서버에서 직접 검증.';

-- app_error_logs 조회를 "로그인만 하면" → "실제 관리자만"으로 강화.
drop policy if exists "app_error_logs_select_authenticated" on public.app_error_logs;
create policy "app_error_logs_select_admin_only" on public.app_error_logs
  for select using (public.is_admin());

-- 가입자 수 집계도 관리자만 조회 가능하도록 함수 내부에서 검증(비관리자는 예외 발생).
create or replace function public.get_user_count()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return (select count(*) from auth.users);
end;
$$;
