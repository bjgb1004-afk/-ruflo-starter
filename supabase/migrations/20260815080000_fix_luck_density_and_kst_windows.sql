-- 버그 1: sido_luck_density()의 분자(prize_counts)가 store_ranking_stats를 그대로 합산해서
-- is_active=false로 폐업 처리된 매장의 1등 배출 횟수까지 분자에 포함시키는데, 분모
-- (store_counts)는 is_active인 매장만 세고 있었다 - 폐업 매장이 있는 지역일수록 "매장당
-- 평균 1등 배출 비율"이 실제보다 부풀려짐. stores와 join해서 분자도 동일하게 걸러낸다.
create or replace function public.sido_luck_density()
returns table (
  sido text,
  store_count bigint,
  total_first_prize bigint,
  luck_index numeric
)
language sql
stable
as $$
  with store_counts as (
    select s.sido, count(*) as store_count
    from public.stores s
    where s.is_active and s.sido is not null
    group by s.sido
  ),
  prize_counts as (
    select r.sido, sum(r.first_prize_count) as total_first_prize
    from public.store_ranking_stats r
    join public.stores s on s.id = r.id
    where r.sido is not null and s.is_active
    group by r.sido
  )
  select
    sc.sido,
    sc.store_count,
    coalesce(pc.total_first_prize, 0) as total_first_prize,
    round(coalesce(pc.total_first_prize, 0)::numeric / nullif(sc.store_count, 0), 4) as luck_index
  from store_counts sc
  left join prize_counts pc on pc.sido = sc.sido
  order by luck_index desc nulls last;
$$;

-- 버그 2: refresh_store_ranking_stats()의 1yr/5yr 집계가 draw_date(KST 기준 날짜)를
-- now() - interval 'N year'(UTC timestamptz)와 그대로 비교해서, DB 세션 타임존(UTC) 기준으로
-- 캐스팅되어 최대 9시간 어긋난 경계로 계산되고 있었다. draw_date를 명시적으로 KST
-- timestamptz로 캐스팅해서 비교한다 - 1yr/5yr 경계에 걸친 회차에서만 눈에 띄는 차이지만,
-- store_score(추천순위 가중치)에 직접 쓰이는 값이라 고쳐둔다.
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

-- 버그 3(낮음): app_error_logs insert가 아무 제약 없이 전면 개방(check(true))돼 있어서
-- 비로그인 클라이언트도 임의 길이의 문자열을 무제한으로 쌓아 관리자 대시보드를 오염시키거나
-- 저장공간을 낭비할 수 있었다. 길이 제약만 최소한으로 건다(기능 변경 없음).
alter table public.app_error_logs
  add constraint app_error_logs_message_length check (char_length(message) <= 2000),
  add constraint app_error_logs_feature_length check (char_length(feature) <= 200);
