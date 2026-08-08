-- "이번달 HOT 지역" 배지를 지도 위 시/도 중심 좌표에 마커로 표시하기 위한 함수.
-- 행정구역 경계 데이터가 없어서, 그 시/도의 운영중 매장 좌표 평균("무게중심")을
-- 근사 중심으로 사용한다 - 정확한 행정 중심은 아니지만 매장이 몰린 실제 생활권
-- 중심에 더 가까워 실용적으로 충분하다.
create or replace function public.sido_centroids()
returns table (
  sido text,
  latitude double precision,
  longitude double precision
)
language sql
stable
as $$
  select sido, avg(latitude) as latitude, avg(longitude) as longitude
  from public.stores
  where is_active and sido is not null
  group by sido;
$$;

comment on function public.sido_centroids is
  '시/도별 운영중 매장 좌표 평균(근사 중심) - 지도 위 지역 단위 마커(이번달 HOT 등) 배치용';
