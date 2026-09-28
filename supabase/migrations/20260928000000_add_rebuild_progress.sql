-- 배출점 공식 재수집(rebuildWinStoresFromOfficial.ts)이 어디까지 갔는지 기록한다.
--
-- 한 번에 다 못 돌리기 때문에 필요하다: 동행복권이 이 엔드포인트를 연속으로 때리면
-- IP째 TCP 연결을 끊어버린다(2026-09-28 실측 - 로컬 48회차, GitHub Actions 31회차 만에
-- 차단). 그래서 20회차씩 나눠서 30분 간격으로 돌리고, 다음에 어디서 이어갈지를 여기
-- 한 행에 남긴다. 차단으로 중단된 회차는 포인터를 안 옮기므로 다음 실행이 같은 자리에서
-- 다시 시작한다.
create table if not exists rebuild_progress (
  id text primary key,
  next_draw_no integer not null,
  updated_at timestamptz not null default now()
);

insert into rebuild_progress (id, next_draw_no)
values ('win-stores', 262)
on conflict (id) do nothing;

-- service role(GitHub Actions)만 쓰므로 잠가둔다.
alter table rebuild_progress enable row level security;
