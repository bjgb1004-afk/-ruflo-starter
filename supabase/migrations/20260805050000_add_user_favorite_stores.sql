-- 로그인 사용자의 즐겨찾기를 기기 간 동기화하기 위한 테이블.
-- 비로그인 사용자는 계속 로컬(AsyncStorage)만 사용하며, 로그인 시 로컬 목록을
-- 이 테이블과 병합(merge)한다.
create table if not exists public.user_favorite_stores (
  user_id     uuid not null references auth.users(id) on delete cascade,
  store_id    uuid not null,
  store_name  text not null,
  store_address text not null,
  created_at  timestamp not null default now(),
  primary key (user_id, store_id)
);

comment on table public.user_favorite_stores is '로그인 사용자의 즐겨찾기 판매점 (클라우드 동기화)';

alter table public.user_favorite_stores enable row level security;

create policy "user_favorite_stores_own_select" on public.user_favorite_stores
  for select using (auth.uid() = user_id);

create policy "user_favorite_stores_own_insert" on public.user_favorite_stores
  for insert with check (auth.uid() = user_id);

create policy "user_favorite_stores_own_delete" on public.user_favorite_stores
  for delete using (auth.uid() = user_id);
