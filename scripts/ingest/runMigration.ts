/**
 * Supabase 마이그레이션 실행 스크립트
 *
 * 사용법:
 * SUPABASE_URL=https://xxx.supabase.co \
 * SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx \
 * npx tsx runMigration.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ 환경 변수 필수:");
  console.error("   SUPABASE_URL");
  console.error("   SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 마이그레이션 SQL (RLS 정책 부분 제외)
const migrationSQL = `
-- 1. 확장 기능
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- 2. 공통 함수: updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3. stores (판매점)
create table if not exists public.stores (
  id            uuid primary key,
  external_id   text unique,
  name          text not null,
  store_type    text,
  address       text not null,
  road_address  text,
  sido          text,
  sigungu       text,
  phone         text,
  dong_code     text,
  building_main integer,
  building_sub  integer,
  latitude      double precision not null,
  longitude     double precision not null,
  location      extensions.geography(point, 4326)
                  generated always as (
                    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
                  ) stored,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.stores is '전국 로또 판매점 위치 정보';

create index if not exists idx_stores_location on public.stores using gist (location);
create index if not exists idx_stores_sido_sigungu on public.stores (sido, sigungu);
create index if not exists idx_stores_name_trgm on public.stores using gin (name extensions.gin_trgm_ops);

drop trigger if exists trg_stores_updated_at on public.stores;
create trigger trg_stores_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

-- 4. draw_history (회차별 당첨 번호 + 배출 매장)
create table if not exists public.draw_history (
  draw_no                     integer primary key,
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

comment on table public.draw_history is '회차별 당첨 번호, 판매 통계 및 배출 판매점';

create index if not exists idx_draw_history_date on public.draw_history (draw_date desc);
create index if not exists idx_draw_history_first_prize_stores
  on public.draw_history using gin (first_prize_store_ids);
create index if not exists idx_draw_history_second_prize_stores
  on public.draw_history using gin (second_prize_store_ids);

-- 5. store_ranking_stats (물리 랭킹 테이블)
create table if not exists public.store_ranking_stats (
  id                      uuid primary key references public.stores (id) on delete cascade,
  name                    text not null,
  address                 text not null,
  sido                    text,
  sigungu                 text,
  location                extensions.geography(point, 4326) not null,
  first_prize_count       integer not null default 0,
  second_prize_count      integer not null default 0,
  first_prize_1yr         integer not null default 0,
  first_prize_5yr         integer not null default 0,
  second_prize_1yr        integer not null default 0,
  last_first_prize_draw   integer,
  last_second_prize_draw  integer,
  nation_rank             integer,
  province_rank           integer,
  city_rank               integer,
  store_score             numeric not null default 0,
  updated_at              timestamptz not null default now()
);

comment on table public.store_ranking_stats is '판매점별 배출 통계 및 명당 순위';

create index if not exists idx_ranking_stats_score on public.store_ranking_stats (store_score desc);
create index if not exists idx_ranking_stats_province on public.store_ranking_stats (sido, province_rank);
create index if not exists idx_ranking_stats_city on public.store_ranking_stats (sido, sigungu, city_rank);
create index if not exists idx_ranking_stats_location on public.store_ranking_stats using gist (location);

-- 6. refresh_store_ranking_stats() RPC 함수
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

-- 7. stores_within_radius() 함수
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

-- 8. nearby_stores() 함수
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

-- 9. RLS 정책 설정
alter table public.stores enable row level security;
alter table public.draw_history enable row level security;
alter table public.store_ranking_stats enable row level security;

drop policy if exists "stores_public_read" on public.stores;
drop policy if exists "draw_history_public_read" on public.draw_history;
drop policy if exists "store_ranking_stats_public_read" on public.store_ranking_stats;

create policy "stores_public_read" on public.stores
  for select using (true);

create policy "draw_history_public_read" on public.draw_history
  for select using (true);

create policy "store_ranking_stats_public_read" on public.store_ranking_stats
  for select using (true);
`;

async function main() {
  console.log("🚀 Supabase 마이그레이션 실행 중...");
  console.log(`📍 URL: ${SUPABASE_URL}`);
  console.log("");

  try {
    // SQL을 여러 개의 명령으로 분할
    const statements = migrationSQL
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    let executed = 0;

    for (const statement of statements) {
      try {
        const { error } = await supabase.rpc("exec_sql", { sql: statement });

        if (error) {
          // exec_sql가 없으면 다른 방법 시도
          if (error.message.includes("does not exist")) {
            console.log(
              "⚠️  exec_sql 함수 없음. 직접 SQL 실행 불가능합니다.",
            );
            console.log("");
            console.log("❌ 현재 방법이 작동하지 않습니다.");
            console.log("");
            console.log("🔄 대체 방법:");
            console.log(
              "1. Supabase Dashboard → SQL Editor 접속",
            );
            console.log("2. 아래 SQL을 복사해서 붙여넣기");
            console.log("3. RUN 클릭");
            console.log("");
            console.log("SQL:");
            console.log("---");
            console.log(migrationSQL);
            process.exit(1);
          }
          console.warn(`⚠️  Statement 실행 실패: ${error.message}`);
          console.warn(`   SQL: ${statement.substring(0, 50)}...`);
          continue;
        }

        executed++;
        console.log(
          `✅ (${executed}/${statements.length}) ${statement.substring(0, 40)}...`,
        );
      } catch (err) {
        console.warn(`❌ Statement 오류: ${err}`);
      }
    }

    console.log("");
    console.log("✅ 마이그레이션 완료!");
    console.log(`   총 ${executed}개 statement 실행됨`);
  } catch (error) {
    console.error("❌ 마이그레이션 실패:", error);
    process.exit(1);
  }
}

main();
