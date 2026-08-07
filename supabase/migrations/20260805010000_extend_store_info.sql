-- 판매점 정보 확장: 영업시간, 편의시설, 평점, 리뷰
alter table public.stores
  add column if not exists business_hours jsonb default '{"mon":"09:00-23:00","tue":"09:00-23:00","wed":"09:00-23:00","thu":"09:00-23:00","fri":"09:00-23:00","sat":"09:00-23:00","sun":"09:00-23:00"}',
  add column if not exists has_parking boolean default false,
  add column if not exists has_restroom boolean default false,
  add column if not exists has_atm boolean default false,
  add column if not exists website_url text,
  add column if not exists rating float default 0.0,
  add column if not exists review_count integer default 0,
  add column if not exists amenities text[],
  add column if not exists latest_review text,
  add column if not exists info_updated_at timestamp default now();

comment on column public.stores.business_hours is '{"mon":"09:00-23:00", ...} 형식의 영업시간';
comment on column public.stores.has_parking is '주차 가능 여부';
comment on column public.stores.has_restroom is '화장실 보유 여부';
comment on column public.stores.has_atm is 'ATM 보유 여부';
comment on column public.stores.website_url is '판매점 웹사이트 또는 SNS 링크';
comment on column public.stores.rating is '사용자 평점 (1-5.0)';
comment on column public.stores.review_count is '리뷰 수';
comment on column public.stores.amenities is '{"편의점","주차","화장실"} 등의 편의시설 목록';
comment on column public.stores.latest_review is '최신 사용자 리뷰';
comment on column public.stores.info_updated_at is '판매점 정보 마지막 업데이트 시각';
