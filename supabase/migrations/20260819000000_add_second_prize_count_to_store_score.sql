-- store_score(추천순위 가중치)가 1등 누적 횟수는 반영하면서(× 5) 2등 누적 횟수는 전혀
-- 반영하지 않고 있었다 - "최근 1년 내 2등"만 점수화(× 10)했을 뿐, 그 밖의 2등 이력은
-- 점수에 0으로 취급됨. 그 결과 "2등을 3번 했지만 전부 1년 넘은" 매장이 "2등을 1번,
-- 최근에 했다"뿐인 매장보다 지도 추천순위에서 낮게 나오는 역전 현상이 실사용에서
-- 재현됨(성남시 로또뱅크 2등3회·점수0 vs 백억복권 2등1회·점수10).
-- 1등 누적 가중치(× 5)와 같은 5:1 비율(1년 내 가중치 50:10과 동일 비율)로 2등 누적에도
-- × 1 가중치를 더한다.
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
      count(*) filter (where rnk = 1)                                                                                as first_prize_count,
      count(*) filter (where rnk = 1 and (draw_date::timestamp at time zone 'Asia/Seoul') >= now() - interval '1 year')  as first_prize_1yr,
      count(*) filter (where rnk = 1 and (draw_date::timestamp at time zone 'Asia/Seoul') >= now() - interval '5 years') as first_prize_5yr,
      count(*) filter (where rnk = 2 and (draw_date::timestamp at time zone 'Asia/Seoul') >= now() - interval '1 year')  as second_prize_1yr,
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
      count(*) filter (where rnk = 1)                                                                                as first_prize_count,
      count(*) filter (where rnk = 1 and (draw_date::timestamp at time zone 'Asia/Seoul') >= now() - interval '1 year')  as first_prize_1yr,
      count(*) filter (where rnk = 1 and (draw_date::timestamp at time zone 'Asia/Seoul') >= now() - interval '5 years') as first_prize_5yr,
      count(*) filter (where rnk = 2 and (draw_date::timestamp at time zone 'Asia/Seoul') >= now() - interval '1 year')  as second_prize_1yr,
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
      + ((coalesce(a.first_prize_count, 0) + s.historical_first_prize_count) * 5)
      + ((coalesce(ab.second_prize_count_since_baseline, 0) + s.historical_second_prize_count) * 1),
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

select public.refresh_store_ranking_stats();
