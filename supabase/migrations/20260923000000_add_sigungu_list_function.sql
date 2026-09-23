-- 랭킹 화면의 "시/군/구 선택" 목록이 시/도에 따라 통째로 누락되던 문제.
-- 앱이 store_ranking_stats에서 sigungu 컬럼을 limit(5000)으로 긁어와 클라이언트에서
-- 중복 제거하고 있었는데, PostgREST의 db.max_rows(1000)에 잘려서 매장 수가 1000개를
-- 넘는 시/도(서울 25개 중 13개만, 경기 31개 중 13개만)는 나머지 구/군이 목록에서
-- 사라졌다. 행 수에 의존하지 않도록 DISTINCT를 서버에서 처리한다.
create or replace function public.sigungu_list(p_sido text)
returns table (sigungu text)
language sql
stable
as $$
  select distinct r.sigungu
  from public.store_ranking_stats r
  where r.sido = p_sido
    and r.sigungu is not null
  order by 1;
$$;

comment on function public.sigungu_list(text) is '시/도 하나에 속한 시/군/구 목록 (랭킹 화면 드롭다운용)';
