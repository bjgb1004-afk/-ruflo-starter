-- 1) 2등 누적 카운트 이중 계산 버그 수정.
-- historical_second_prize_count(lottorich.co.kr 스냅샷)는 draw_history가 추적하는
-- 마지막 회차(1235회, 2026-08-01)보다 나중에 수집됐다. 즉 1226~1235회의 2등 배출은
-- 이미 스냅샷 누적치에 포함되어 있을 가능성이 높은데, 기존 refresh_store_ranking_stats()는
-- draw_history 집계분을 무조건 또 더해서 실제보다 부풀려진 값이 나왔다
-- (예: 부일카서비스 = 스냅샷 3 + draw_history 4 = 7로 표시, 실제로는 스냅샷 3이
-- 이미 그 4건을 포함하고 있을 가능성이 높음).
-- 스냅샷이 있는(historical_second_prize_count > 0) 매장에 한해, 스냅샷 커버 회차
-- 이후에 새로 수집되는 회차만 추가로 더하도록 바꾼다. 스냅샷이 없는(=0) 매장은
-- 애초에 더할 대상이 없으므로 draw_history 전체를 그대로 센다.
alter table public.stores
  add column if not exists historical_second_prize_baseline_draw_no integer not null default 1235;

comment on column public.stores.historical_second_prize_baseline_draw_no is
  'historical_second_prize_count 스냅샷이 커버하는 마지막 회차 번호 - 이 회차 이하의 draw_history 매칭은 중복 계산 방지를 위해 누적치에 다시 더하지 않는다(스냅샷이 없는 매장은 해당 없음)';

-- 2) 순위 산정 로직 변경: store_score(가중 점수) 대신
--    1등 당첨 횟수 내림차순 → 동률 시 2등 당첨 횟수 내림차순 → 동률 시 최근 당첨 회차순.
--    store_score 자체는 지도 화면의 "추천순" 정렬에 계속 쓰이므로 값 계산은 그대로 둔다.
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
