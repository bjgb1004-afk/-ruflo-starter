-- 앱이 열릴 때 "이번 회차 아직 안 들어왔으면 GitHub Actions를 즉시 깨운다" 트리거용 락.
-- 여러 사용자가 거의 동시에 앱을 열어도 하나만 실제로 트리거하도록, 단일 행에 마지막
-- 트리거 시각을 원자적(atomic UPDATE ... WHERE ...)으로 기록한다 - 별도 잠금 테이블/RPC
-- 없이 이 한 행의 조건부 UPDATE만으로 "먼저 누른 사람만 통과" 동작이 성립한다.
create table if not exists sync_lock (
  id text primary key,
  last_triggered_at timestamptz not null default '1970-01-01'::timestamptz
);

insert into sync_lock (id, last_triggered_at)
values ('draw-sync', '1970-01-01'::timestamptz)
on conflict (id) do nothing;

-- service role(Edge Function)만 다루므로 RLS는 걸어 잠그고 별도 정책은 두지 않는다.
alter table sync_lock enable row level security;
