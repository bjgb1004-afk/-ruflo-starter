-- "앱에서 나간 번호가 이번 회차에 몇 등을 했고 당첨금이 얼마인지" 화면에 띄우기 위한 집계.
--
-- 지금까지 생성 번호(천재들의 한수/번호대 분석/수학 분석)는 기기 로컬(AsyncStorage)에만
-- 남아 서버가 성적을 알 방법이 없었다. 로그인 없는 앱이므로 계정 대신 아무 식별자도 두지
-- 않는다 - 번호와 회차, 어느 코너에서 나왔는지만 익명으로 모은다.
--
-- 원본 번호는 회차별로 리셋한다: 추첨 후 배치가 등수·당첨금을 집계해
-- generator_round_stats에 쌓고 나면 generated_tickets의 그 회차 행은 삭제된다.
-- 영구 보관은 회차×코너당 한 줄짜리 집계뿐이라 용량이 늘지 않는다.

create table public.generated_tickets (
  id         uuid primary key default gen_random_uuid(),
  draw_no    integer not null,
  -- 어느 코너에서 나온 번호인지. "genius:archimedes", "band", "math:gaussian" 꼴.
  source     text not null,
  numbers    integer[] not null,
  created_at timestamptz not null default now()
);

create index idx_generated_tickets_draw on public.generated_tickets (draw_no);

alter table public.generated_tickets enable row level security;

-- 로그인 없는 앱이라 anon 키로 insert만 허용한다. 조회·삭제는 집계 배치(service role)만 -
-- 남의 번호를 클라이언트에서 긁어갈 수 없게 한다.
create policy generated_tickets_insert_anon
  on public.generated_tickets
  for insert
  to anon, authenticated
  with check (true);

comment on table public.generated_tickets is
  '앱에서 나간 생성 번호(익명). 추첨 후 집계되면 그 회차 행은 삭제된다 - 번호를 서버에 오래 보관하지 않기 위함';

-- 회차 × 코너별 성적. 이것만 영구 보관한다.
create table public.generator_round_stats (
  draw_no       integer not null,
  source        text not null,
  games         integer not null default 0,
  rank1         integer not null default 0,
  rank2         integer not null default 0,
  rank3         integer not null default 0,
  rank4         integer not null default 0,
  rank5         integer not null default 0,
  -- 금액을 아는 등수만 더한 합계. 1~3등은 회차마다 금액이 다르고 발표가 늦을 수 있다.
  prize_total   bigint not null default 0,
  -- 1인당 금액이 공개되지 않아 prize_total에 못 넣은 건수. 0원과 구분하기 위해 따로 센다.
  prize_unknown integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (draw_no, source)
);

alter table public.generator_round_stats enable row level security;

-- 개인을 식별할 게 없는 순수 집계라 누구나 읽을 수 있다. 쓰기는 service role만.
create policy generator_round_stats_read
  on public.generator_round_stats
  for select
  to anon, authenticated
  using (true);

comment on table public.generator_round_stats is
  '회차×코너별 생성 번호 성적(게임 수, 등수별 건수, 당첨금 합계). 영구 보관';

-- 화면이 한 번 호출로 "이번 회차 + 누적"을 다 받게 한다. 누적을 클라이언트에서 더하면
-- 회차가 쌓일수록 PostgREST 1,000행 상한에 걸린다.
create or replace function public.generator_stats(p_draw_no integer default null)
returns json
language sql
stable
as $$
  with target as (
    select coalesce(p_draw_no, (select max(draw_no) from public.generator_round_stats)) as draw_no
  ),
  round_rows as (
    select s.* from public.generator_round_stats s, target t where s.draw_no = t.draw_no
  )
  select json_build_object(
    'drawNo', (select draw_no from target),
    'round', (
      select json_build_object(
        'games', coalesce(sum(games), 0),
        'rank1', coalesce(sum(rank1), 0),
        'rank2', coalesce(sum(rank2), 0),
        'rank3', coalesce(sum(rank3), 0),
        'rank4', coalesce(sum(rank4), 0),
        'rank5', coalesce(sum(rank5), 0),
        'prizeTotal', coalesce(sum(prize_total), 0),
        'prizeUnknown', coalesce(sum(prize_unknown), 0)
      ) from round_rows
    ),
    'bySource', (
      select coalesce(
        json_agg(
          json_build_object(
            'source', source,
            'games', games,
            'rank1', rank1, 'rank2', rank2, 'rank3', rank3, 'rank4', rank4, 'rank5', rank5,
            'prizeTotal', prize_total,
            'prizeUnknown', prize_unknown
          ) order by (rank1 + rank2 + rank3 + rank4 + rank5) desc, games desc
        ),
        '[]'::json
      ) from round_rows
    ),
    'cumulative', (
      select json_build_object(
        'rounds', count(distinct draw_no),
        'games', coalesce(sum(games), 0),
        'rank1', coalesce(sum(rank1), 0),
        'rank2', coalesce(sum(rank2), 0),
        'rank3', coalesce(sum(rank3), 0),
        'rank4', coalesce(sum(rank4), 0),
        'rank5', coalesce(sum(rank5), 0),
        'prizeTotal', coalesce(sum(prize_total), 0),
        'prizeUnknown', coalesce(sum(prize_unknown), 0),
        'fromDrawNo', min(draw_no)
      ) from public.generator_round_stats
    )
  );
$$;

grant execute on function public.generator_stats(integer) to anon, authenticated;
