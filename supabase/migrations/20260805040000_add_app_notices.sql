-- 새 기능/데이터 업데이트를 알리는 공지 카드용 테이블.
-- 관리자가 Supabase Dashboard에서 직접 행을 추가/비활성화하는 용도 (앱에서는 읽기 전용).
create table if not exists public.app_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  is_active boolean not null default true,
  created_at timestamp not null default now()
);

comment on table public.app_notices is '홈 화면 공지 카드 (새 기능/데이터 업데이트 안내)';

alter table public.app_notices enable row level security;

create policy "app_notices_public_read" on public.app_notices
  for select using (is_active);

insert into public.app_notices (title, message) values
  ('새 기능 업데이트', '즐겨찾기, 길찾기, 지도 검색 기능이 추가되었습니다! 🎉');
