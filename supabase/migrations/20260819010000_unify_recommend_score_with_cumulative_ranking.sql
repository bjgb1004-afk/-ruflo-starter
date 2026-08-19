-- 지도 "추천순"(store_score → nearby_stores.recommend_score)과 "명당 랭킹" 탭
-- (nation_rank/province_rank/city_rank)이 서로 다른 기준을 써서, 같은 매장이 두 화면에서
-- 다른 순서로 보이는 문제가 있었다. 랭킹 탭 쪽 기준(순수 누적: 1등 수 → 2등 수 → 최근
-- 1등 회차, 최근성 가중치 없음)으로 store_score를 재정의해 두 화면을 통일한다.
--
-- first_prize_count 1점 차이가 second_prize_count 아무리 커도(현실적으로 매장 하나가 평생
-- 수백 번 당첨될 수 없음) 절대 안 뒤집히도록, second_prize_count 1점 차이가 last_first_prize_draw
-- 차이(현재 최대 약 1300대) 아무리 커도 절대 안 뒤집히도록 자릿수를 충분히 벌려서 인코딩한다
-- - 문자 그대로 "1등 수 desc, 2등 수 desc, 최근 1등 회차 desc"와 동일한 정렬 결과를 내는 숫자.
-- nearby_stores()의 "거리로 미세조정" 로직(최대 45점)은 그대로 둬도, 이 인코딩 자체가
-- 압도적으로 크기 때문에 사실상 매장의 누적 실적이 항상 거리를 이긴다 - 지도 추천순도
-- 랭킹 탭과 같은 "역대 실적" 기준이 된다.
--
-- first_prize_1yr/first_prize_5yr/second_prize_1yr은 store_score 계산에서는 빠지지만,
-- 매장 상세 화면의 "1년/5년 당첨 통계" 표시용으로는 계속 그대로 집계해서 저장한다.
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
    ((coalesce(a.first_prize_count, 0) + s.historical_first_prize_count)::numeric * 10000000)
      + ((coalesce(ab.second_prize_count_since_baseline, 0) + s.historical_second_prize_count)::numeric * 10000)
      + coalesce(a.last_first_prize_draw, 0),
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
