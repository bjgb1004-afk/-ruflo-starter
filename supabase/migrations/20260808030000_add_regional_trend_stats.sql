-- design.txt "지역별 복권 분석 통계 3종 세트" 지원용 RPC 4개.
-- 모두 stable SQL 함수로, 기존 nearby_stores/refresh_store_ranking_stats와 동일하게
-- 별도 GRANT 없이(테이블들이 이미 RLS public_read 정책) anon/authenticated가 호출 가능하다.

-- 1) 지역별 명당 밀도(행운 지수) = 시/도 총 1등 당첨 횟수 ÷ 시/도 운영중 판매점 수.
-- store_ranking_stats는 당첨 이력이 있는 매장만 존재하므로, 전체 매장 수는 stores에서 따로 센다.
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
    where r.sido is not null
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

comment on function public.sido_luck_density is
  '시/도별 매장당 평균 1등 배출 비율(행운 지수) = 시/도 누적 1등 배출 횟수 ÷ 운영중 매장 수';

-- 2) 최근 트렌드: weeks_back가 null이면 전체 누적, 숫자면 최근 N회차(주 단위) 기준
-- 시/도별 1등 배출 횟수. "이번 달 HOT 지역"은 weeks_back=4 호출 결과의 1행,
-- 통계 탭(4주/10주/전체)도 이 함수 하나로 처리한다.
create or replace function public.regional_trend(weeks_back integer default null)
returns table (
  sido text,
  first_prize_count bigint
)
language sql
stable
as $$
  with latest as (
    select max(draw_no) as max_no from public.draw_history
  ),
  scoped_draws as (
    select d.draw_no, d.first_prize_store_ids
    from public.draw_history d, latest l
    where weeks_back is null or d.draw_no > l.max_no - weeks_back
  ),
  winners as (
    select s.sido
    from scoped_draws d
    cross join lateral unnest(d.first_prize_store_ids) as f(store_id)
    join public.stores s on s.id = f.store_id
    where s.sido is not null
  )
  select sido, count(*) as first_prize_count
  from winners
  group by sido
  order by first_prize_count desc;
$$;

comment on function public.regional_trend is
  '최근 weeks_back회차(null=전체 누적) 기준 시/도별 1등 배출 횟수 내림차순 - 통계 탭 4주/10주/전체 및 HOT 지역 배지에 사용';

-- 3) 최근 streak_weeks회차 "전부"에서 1등을 배출한 시/군/구 = 연속 당첨 지역.
-- 대상 구간을 정확히 최근 streak_weeks개 회차로 고정하므로, weeks_hit이 그 개수와
-- 같다는 것 자체가 "매 회차 빠짐없이 배출"(연속)임을 뜻한다.
create or replace function public.consecutive_win_sigungu(streak_weeks integer default 3)
returns table (
  sido text,
  sigungu text,
  streak_weeks_out integer
)
language sql
stable
as $$
  with latest as (
    select max(draw_no) as max_no from public.draw_history
  ),
  target_draws as (
    select generate_series(l.max_no - streak_weeks + 1, l.max_no) as draw_no from latest l
  ),
  winners as (
    select d.draw_no, s.sido, s.sigungu
    from public.draw_history d
    cross join lateral unnest(d.first_prize_store_ids) as f(store_id)
    join public.stores s on s.id = f.store_id
    where d.draw_no in (select draw_no from target_draws)
      and s.sido is not null and s.sigungu is not null
  )
  select sido, sigungu, count(distinct draw_no)::integer as streak_weeks_out
  from winners
  group by sido, sigungu
  having count(distinct draw_no) >= streak_weeks
  order by streak_weeks_out desc, sido, sigungu;
$$;

comment on function public.consecutive_win_sigungu is
  '최근 streak_weeks회차 전부에서 1등을 배출한 시/군/구 목록(연속 당첨 지역 배지용)';

-- 4) 시/도별 1등 당첨 구매방식(자동/수동/반자동) 비율. draw_first_prize_methods는
-- pyony.com에서 매칭된 회차만 존재(임의 추정 없음)하므로, total_count는 "구매방식이
-- 확인된 1등 건수"이지 시/도 전체 1등 배출 건수가 아니다.
create or replace function public.sido_purchase_type_ratio()
returns table (
  sido text,
  auto_count bigint,
  manual_count bigint,
  semi_auto_count bigint,
  total_count bigint
)
language sql
stable
as $$
  select
    s.sido,
    count(*) filter (where m.purchase_type = '자동')   as auto_count,
    count(*) filter (where m.purchase_type = '수동')   as manual_count,
    count(*) filter (where m.purchase_type = '반자동') as semi_auto_count,
    count(*)                                            as total_count
  from public.draw_first_prize_methods m
  join public.stores s on s.id = m.store_id
  where s.sido is not null
  group by s.sido
  order by total_count desc;
$$;

comment on function public.sido_purchase_type_ratio is
  '시/도별 1등 당첨 구매방식(자동/수동/반자동) 건수 - 구매방식이 확인된(pyony.com 매칭) 건에 한함';
