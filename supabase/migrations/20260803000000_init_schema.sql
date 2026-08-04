-- =============================================================
-- 전국 로또 지도 통계 플랫폼 - 초기 스키마 (데이터 수집/백엔드 고도화 반영)
-- PostGIS 활성화, stores(판매점), draw_history(회차별 당첨/배출 이력),
-- store_ranking_stats(물리 랭킹 테이블), 매칭/추천 지원 함수
-- =============================================================

-- 1. 확장 기능 ---------------------------------------------------
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- 2. 공통 함수: updated_at 자동 갱신 --------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3. stores (판매점) ------------------------------------------------
-- id는 DB가 생성하지 않는다. 수집 배치(scripts/ingest/lib/storeId.ts)가
-- SHA-1(Namespace + 행정동코드 + 본번-부번 + 소수점 4자리 좌표) 기반 UUID v5로
-- 결정론적으로 생성해 공급하며, 상호/주소가 바뀌어도 물리적 입지가 같으면
-- 동일한 id가 재생성되어 매장 정체성이 유지된다.
create table if not exists public.stores (
  id            uuid primary key,
  external_id   text unique,                 -- 공공데이터 원본 매장 관리번호 (추적용, upsert 매칭 키 아님)
  name          text not null,
  store_type    text,                        -- 예: 일반, 인터넷겸업
  address       text not null,               -- 정규화된 주소 (Address Normalizer 결과)
  road_address  text,
  sido          text,                        -- 시/도 (지역별 통계/필터, 정규화된 정식 명칭)
  sigungu       text,                        -- 시/군/구
  phone         text,
  dong_code     text,                        -- 행정동/법정동 코드 (store_id 산출 키의 일부)
  building_main integer,                     -- 지번/도로명 본번 (store_id 산출 키 + Cascading Match 3단계)
  building_sub  integer,                     -- 지번/도로명 부번 (없으면 0)
  latitude      double precision not null,
  longitude     double precision not null,
  location      extensions.geography(point, 4326)
                  generated always as (
                    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
                  ) stored,                  -- GPS 반경 검색/매칭용 공간 컬럼 (PostGIS)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.stores is '전국 로또 판매점 위치 정보 (id = 위치 기반 결정론적 UUID v5)';

create index if not exists idx_stores_location on public.stores using gist (location);
create index if not exists idx_stores_sido_sigungu on public.stores (sido, sigungu);
create index if not exists idx_stores_name_trgm on public.stores using gin (name extensions.gin_trgm_ops);

drop trigger if exists trg_stores_updated_at on public.stores;
create trigger trg_stores_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

-- 4. draw_history (회차별 당첨 번호 + 1·2등 배출 매장 이력) -----------------
-- 배출 매장이 여러 곳일 수 있어 stores.id 배열로 보관하고,
-- 매장별 누적/기간별 통계는 store_ranking_stats(물리 테이블)에서 배치로 집계한다.
create table if not exists public.draw_history (
  draw_no                     integer primary key,          -- 회차
  draw_date                   date not null,
  winning_numbers              smallint[] not null,
  bonus_number                 smallint not null,
  first_prize_total_amount     bigint,
  first_prize_winner_count     integer,
  first_prize_amount_per_win   bigint,
  total_sales_amount           bigint,
  first_prize_store_ids        uuid[] not null default '{}',
  second_prize_store_ids       uuid[] not null default '{}',
  created_at                   timestamptz not null default now(),
  constraint chk_winning_numbers_length check (array_length(winning_numbers, 1) = 6)
);

comment on table public.draw_history is '회차별 당첨 번호, 판매 통계 및 1·2등 배출 판매점(stores.id) 이력';

create index if not exists idx_draw_history_date on public.draw_history (draw_date desc);
create index if not exists idx_draw_history_first_prize_stores
  on public.draw_history using gin (first_prize_store_ids);
create index if not exists idx_draw_history_second_prize_stores
  on public.draw_history using gin (second_prize_store_ids);

-- 5. store_ranking_stats (물리 랭킹 테이블) ------------------------------
-- 조회 성능을 위해 View 대신 물리 테이블로 두고, 수집 배치가 매 실행마다
-- refresh_store_ranking_stats()를 호출해 전체 UPSERT/재계산한다.
create table if not exists public.store_ranking_stats (
  id                      uuid primary key references public.stores (id) on delete cascade,
  name                    text not null,
  address                 text not null,
  sido                    text,
  sigungu                 text,
  location                extensions.geography(point, 4326) not null,
  first_prize_count       integer not null default 0,  -- 누적 1등
  second_prize_count      integer not null default 0,  -- 누적 2등
  first_prize_1yr         integer not null default 0,  -- 최근 1년 1등
  first_prize_5yr         integer not null default 0,  -- 최근 5년 1등
  second_prize_1yr        integer not null default 0,  -- 최근 1년 2등 (store_score 산출용 보조 컬럼)
  last_first_prize_draw   integer,
  last_second_prize_draw  integer,
  nation_rank             integer,
  province_rank           integer,
  city_rank               integer,
  store_score             numeric not null default 0,  -- 거리 요소를 제외한 정적 추천 점수 (아래 6번 참고)
  updated_at              timestamptz not null default now()
);

comment on table public.store_ranking_stats is
  '판매점별 배출 통계 및 명당 순위 (물리 테이블, refresh_store_ranking_stats()로 배치 갱신)';

create index if not exists idx_ranking_stats_score on public.store_ranking_stats (store_score desc);
create index if not exists idx_ranking_stats_province on public.store_ranking_stats (sido, province_rank);
create index if not exists idx_ranking_stats_city on public.store_ranking_stats (sido, sigungu, city_rank);
create index if not exists idx_ranking_stats_location on public.store_ranking_stats using gist (location);

-- 6. refresh_store_ranking_stats() (배치 재계산 함수) -----------------------
-- store_score 공식 (정적 부분, 거리 요소는 nearby_stores()에서 조회 시점에 반영):
--   (최근 1년 1등 수 * 50) + (최근 1년 2등 수 * 10) + (누적 1등 수 * 5)
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
    a.first_prize_count, a.second_prize_count, a.first_prize_1yr, a.first_prize_5yr, a.second_prize_1yr,
    a.last_first_prize_draw, a.last_second_prize_draw,
    (a.first_prize_1yr * 50) + (a.second_prize_1yr * 10) + (a.first_prize_count * 5),
    now()
  from agg a
  join public.stores s on s.id = a.store_id
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

comment on function public.refresh_store_ranking_stats is
  'draw_history를 집계해 store_ranking_stats를 UPSERT하고 전국/시도/시군구 순위를 재계산 (수집 배치 마지막 단계에서 호출)';

-- 7. stores_within_radius() (Cascading Match 지원 함수) -------------------
-- 수집 배치의 단계적 반경/유사도 매칭(scripts/ingest/lib/cascadingMatcher.ts)에서 사용.
create or replace function public.stores_within_radius(
  in_lat    double precision,
  in_lng    double precision,
  radius_m  integer
)
returns table (
  id             uuid,
  name           text,
  address        text,
  latitude       double precision,
  longitude      double precision,
  building_main  integer,
  building_sub   integer
)
language sql
stable
as $$
  select s.id, s.name, s.address, s.latitude, s.longitude, s.building_main, s.building_sub
  from public.stores s
  where extensions.st_dwithin(s.location, extensions.st_setsrid(extensions.st_makepoint(in_lng, in_lat), 4326)::extensions.geography, radius_m);
$$;

comment on function public.stores_within_radius is '반경(m) 내 판매점 후보 목록 (Cascading Match 전용)';

-- 8. nearby_stores() (GPS 기반 반경 검색 + 스마트 추천 함수) ------------------
-- recommend_score = store_score(정적) - (현재 거리km * 15) : 조회 시점의 실시간 거리를 반영해
-- 내비게이션/이동 경로 추천 모드에서 유저에게 최적의 명당을 우선 노출한다.
create or replace function public.nearby_stores(
  in_lat       double precision,
  in_lng       double precision,
  radius_m     integer default 3000,
  max_results  integer default 50
)
returns table (
  store_id            uuid,
  name                text,
  address             text,
  latitude            double precision,
  longitude           double precision,
  distance_m          double precision,
  first_prize_count   integer,
  second_prize_count  integer,
  store_score         numeric,
  recommend_score     numeric,
  nation_rank         integer,
  province_rank       integer,
  city_rank           integer
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.address,
    s.latitude,
    s.longitude,
    extensions.st_distance(s.location, extensions.st_setsrid(extensions.st_makepoint(in_lng, in_lat), 4326)::extensions.geography) as distance_m,
    coalesce(r.first_prize_count, 0)  as first_prize_count,
    coalesce(r.second_prize_count, 0) as second_prize_count,
    coalesce(r.store_score, 0)        as store_score,
    coalesce(r.store_score, 0)
      - (extensions.st_distance(s.location, extensions.st_setsrid(extensions.st_makepoint(in_lng, in_lat), 4326)::extensions.geography) / 1000.0) * 15
                                       as recommend_score,
    r.nation_rank,
    r.province_rank,
    r.city_rank
  from public.stores s
  left join public.store_ranking_stats r on r.id = s.id
  where s.is_active
    and extensions.st_dwithin(s.location, extensions.st_setsrid(extensions.st_makepoint(in_lng, in_lat), 4326)::extensions.geography, radius_m)
  order by recommend_score desc
  limit max_results;
$$;

comment on function public.nearby_stores is
  '반경(m) 내 판매점을 스마트 추천 점수(recommend_score) 순으로 반환 (distance_m으로 거리순 재정렬 가능)';

-- 9. RLS (Row Level Security) --------------------------------------------
alter table public.stores enable row level security;
alter table public.draw_history enable row level security;
alter table public.store_ranking_stats enable row level security;

create policy "stores_public_read" on public.stores
  for select using (true);

create policy "draw_history_public_read" on public.draw_history
  for select using (true);

create policy "store_ranking_stats_public_read" on public.store_ranking_stats
  for select using (true);

-- 쓰기(insert/update/delete)는 GitHub Actions 배치가 service_role 키로 수행하며,
-- service_role은 RLS를 우회하므로 별도의 쓰기 정책은 추가하지 않는다.
