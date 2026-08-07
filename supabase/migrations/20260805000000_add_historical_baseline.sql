-- 누적 배출 이력 베이스라인 반영
-- 게시판(bbs.gobest.co.kr)의 "전국 로또 1등 당첨 명당 TOP 100" (2026-02-07 기준 누적 집계)처럼
-- draw_history로 추적하기 전 시점의 알려진 누적 배출 횟수를 베이스라인으로 별도 저장한다.
-- draw_history는 실제 회차만 담아 순수성을 유지하고, refresh_store_ranking_stats()가
-- 이 베이스라인을 더해 최종 first_prize_count를 계산한다.
-- (1년/5년 필터는 베이스라인의 정확한 배출 시점을 알 수 없으므로 영향받지 않는다.)

alter table public.stores
  add column if not exists historical_first_prize_count integer not null default 0;

comment on column public.stores.historical_first_prize_count is
  'draw_history 추적 이전의 알려진 누적 1등 배출 횟수 베이스라인 (예: 게시판 TOP 100 스냅샷)';

create or replace function public.refresh_store_ranking_stats()
returns void
language plpgsql
as $$
begin
  with wins as (
    select f.store_id, 1 as rnk, d.draw_no, d.draw_date
    from public.draw_history d
    cross join lateral unnest(d.first_prize_store_ids) as f(store_id)
    union all
    select f.store_id, 2 as rnk, d.draw_no, d.draw_date
    from public.draw_history d
    cross join lateral unnest(d.second_prize_store_ids) as f(store_id)
  ),
  agg as (
    select
      store_id,
      count(*) filter (where rnk = 1)                                             as first_prize_count,
      count(*) filter (where rnk = 2)                                             as second_prize_count,
      count(*) filter (where rnk = 1 and draw_date >= now() - interval '1 year')  as first_prize_1yr,
      count(*) filter (where rnk = 1 and draw_date >= now() - interval '5 years') as first_prize_5yr,
      count(*) filter (where rnk = 2 and draw_date >= now() - interval '1 year')  as second_prize_1yr,
      max(draw_no) filter (where rnk = 1)                                        as last_first_prize_draw,
      max(draw_no) filter (where rnk = 2)                                        as last_second_prize_draw
    from wins
    group by store_id
  )
  insert into public.store_ranking_stats (
    id, name, address, sido, sigungu, location,
    first_prize_count, second_prize_count, first_prize_1yr, first_prize_5yr, second_prize_1yr,
    last_first_prize_draw, last_second_prize_draw, store_score, updated_at
  )
  select
    s.id, s.name, s.address, s.sido, s.sigungu, s.location,
    coalesce(a.first_prize_count, 0) + s.historical_first_prize_count,
    coalesce(a.second_prize_count, 0),
    coalesce(a.first_prize_1yr, 0),
    coalesce(a.first_prize_5yr, 0),
    coalesce(a.second_prize_1yr, 0),
    a.last_first_prize_draw, a.last_second_prize_draw,
    (coalesce(a.first_prize_1yr, 0) * 50)
      + (coalesce(a.second_prize_1yr, 0) * 10)
      + ((coalesce(a.first_prize_count, 0) + s.historical_first_prize_count) * 5),
    now()
  from public.stores s
  left join agg a on a.store_id = s.id
  where a.store_id is not null or s.historical_first_prize_count > 0
  on conflict (id) do update set
    name                   = excluded.name,
    address                = excluded.address,
    sido                   = excluded.sido,
    sigungu                = excluded.sigungu,
    location               = excluded.location,
    first_prize_count      = excluded.first_prize_count,
    second_prize_count     = excluded.second_prize_count,
    first_prize_1yr        = excluded.first_prize_1yr,
    first_prize_5yr        = excluded.first_prize_5yr,
    second_prize_1yr       = excluded.second_prize_1yr,
    last_first_prize_draw  = excluded.last_first_prize_draw,
    last_second_prize_draw = excluded.last_second_prize_draw,
    store_score            = excluded.store_score,
    updated_at             = now();

  -- 전국/시도/시군구 순위 재계산
  with ranked as (
    select
      id,
      rank() over (order by store_score desc)                            as nation_rank,
      rank() over (partition by sido order by store_score desc)          as province_rank,
      rank() over (partition by sido, sigungu order by store_score desc) as city_rank
    from public.store_ranking_stats
  )
  update public.store_ranking_stats t
  set nation_rank   = r.nation_rank,
      province_rank = r.province_rank,
      city_rank     = r.city_rank
  from ranked r
  where r.id = t.id;
end;
$$;
