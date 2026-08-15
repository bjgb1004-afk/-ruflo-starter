-- 치명적 버그 발견: refresh_store_ranking_stats()가 INSERT ... ON CONFLICT DO UPDATE만 하고
-- 더 이상 조건(draw_history 참조 또는 historical_*_count > 0)을 만족하지 않게 된 행을
-- 삭제하지 않아, draw_history가 전면 재구축된 2026-08-09 이후 2,151개(전체의 18.6%)
-- store_ranking_stats 행이 "고아 데이터"로 남아 있었다. 실측 사례: "수 종합인테리어"가
-- 2026-08-06 스냅샷 기준 1등4회/2등12회로 표시되고 있었지만 실제로는 복권을 취급하지
-- 않는 업체이고, 현재 draw_history에는 이 매장에 대한 참조가 0건이었다.
-- 이 고아 행들은 nation_rank/province_rank/city_rank 계산에도 함께 섞여 들어가
-- 실제 당첨매장들의 순위를 밀어내는 부작용까지 있었다.
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
      count(*) filter (where rnk = 1 and draw_date >= now() - interval '1 year')  as first_prize_1yr,
      count(*) filter (where rnk = 1 and draw_date >= now() - interval '5 years') as first_prize_5yr,
      count(*) filter (where rnk = 2 and draw_date >= now() - interval '1 year')  as second_prize_1yr,
      max(draw_no) filter (where rnk = 1)                                        as last_first_prize_draw,
      max(draw_no) filter (where rnk = 2)                                        as last_second_prize_draw
    from wins
    group by store_id
  ),
  agg_second_since_baseline as (
    select w.store_id, count(*) as second_prize_count_since_baseline
    from wins w
    join public.stores s on s.id = w.store_id
    where w.rnk = 2
      and (s.historical_second_prize_count = 0 or w.draw_no > s.historical_second_prize_baseline_draw_no)
    group by w.store_id
  ),
  qualifying as (
    select s.id
    from public.stores s
    left join agg a on a.store_id = s.id
    where a.store_id is not null
       or s.historical_first_prize_count > 0
       or s.historical_second_prize_count > 0
  )
  -- 더 이상 조건을 만족하지 않는(당첨이력이 draw_history/historical 스냅샷 어디에도 없는)
  -- 고아 행 제거 - INSERT/UPDATE보다 먼저 지워야 이번 갱신에서 빠진 매장이 즉시 정리된다.
  delete from public.store_ranking_stats t
  where not exists (select 1 from qualifying q where q.id = t.id);

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
      count(*) filter (where rnk = 1 and draw_date >= now() - interval '1 year')  as first_prize_1yr,
      count(*) filter (where rnk = 1 and draw_date >= now() - interval '5 years') as first_prize_5yr,
      count(*) filter (where rnk = 2 and draw_date >= now() - interval '1 year')  as second_prize_1yr,
      max(draw_no) filter (where rnk = 1)                                        as last_first_prize_draw,
      max(draw_no) filter (where rnk = 2)                                        as last_second_prize_draw
    from wins
    group by store_id
  ),
  agg_second_since_baseline as (
    select w.store_id, count(*) as second_prize_count_since_baseline
    from wins w
    join public.stores s on s.id = w.store_id
    where w.rnk = 2
      and (s.historical_second_prize_count = 0 or w.draw_no > s.historical_second_prize_baseline_draw_no)
    group by w.store_id
  )
  insert into public.store_ranking_stats (
    id, name, address, sido, sigungu, location,
    first_prize_count, second_prize_count, first_prize_1yr, first_prize_5yr, second_prize_1yr,
    last_first_prize_draw, last_second_prize_draw, store_score, updated_at
  )
  select
    s.id, s.name, s.address, s.sido, s.sigungu, s.location,
    coalesce(a.first_prize_count, 0) + s.historical_first_prize_count,
    coalesce(ab.second_prize_count_since_baseline, 0) + s.historical_second_prize_count,
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
  left join agg_second_since_baseline ab on ab.store_id = s.id
  where a.store_id is not null
     or s.historical_first_prize_count > 0
     or s.historical_second_prize_count > 0
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

  -- 전국/시도/시군구 순위 재계산: 1등 내림차순 → 동률 시 2등 내림차순 → 동률 시 최근 당첨 회차순
  with ranked as (
    select
      id,
      rank() over (
        order by first_prize_count desc, second_prize_count desc, last_first_prize_draw desc nulls last
      ) as nation_rank,
      rank() over (
        partition by sido
        order by first_prize_count desc, second_prize_count desc, last_first_prize_draw desc nulls last
      ) as province_rank,
      rank() over (
        partition by sido, sigungu
        order by first_prize_count desc, second_prize_count desc, last_first_prize_draw desc nulls last
      ) as city_rank
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
