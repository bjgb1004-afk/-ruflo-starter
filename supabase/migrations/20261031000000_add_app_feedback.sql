-- 앱 안 "불편한 점·의견 보내기". 일반 사용자는 로그인이 없으므로(app_error_logs와 같은 방식)
-- 누구나 보낼 수 있게 두되, 읽기는 관리자만 가능하다. 내용 길이는 DB에서도 제한해
-- 클라이언트 검증을 우회한 대량/초대형 입력을 막는다.

create table if not exists public.app_feedback (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('불편한 점', '아이디어', '오류', '기타')),
  message text not null check (char_length(message) between 5 and 1000),
  contact text check (contact is null or char_length(contact) <= 100),
  app_version text check (app_version is null or char_length(app_version) <= 30),
  platform text check (platform is null or char_length(platform) <= 20),
  created_at timestamptz not null default now()
);

comment on table public.app_feedback is
  '앱 설정의 "불편한 점·의견 보내기"로 들어온 사용자 의견. 삭제율 점검(2026-10-31)에서 불만이 삭제 대신 앱 안으로 들어오게 하려고 추가.';

alter table public.app_feedback enable row level security;

create policy "app_feedback_insert_any" on public.app_feedback
  for insert with check (true);

create policy "app_feedback_select_admin_only" on public.app_feedback
  for select using (public.is_admin());

create index if not exists idx_app_feedback_created_at on public.app_feedback(created_at desc);
