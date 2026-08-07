-- lottoen.com 교차 검증 데이터를 "참고용"으로 별도 저장한다.
-- 기존 address/좌표 파이프라인(VWorld 지오코딩)은 건드리지 않고,
-- 비교/보강 정보만 추가 컬럼에 담아 나중에 검토 후 반영 여부를 결정한다.
alter table public.stores
  add column if not exists lottoen_address text,
  add column if not exists lottoen_first_prize_note text,
  add column if not exists lottoen_second_prize_note text,
  add column if not exists lottoen_verified_at timestamp;

comment on column public.stores.lottoen_address is 'lottoen.com에서 확인한 주소 (참고용, 비교 검증 대기)';
comment on column public.stores.lottoen_first_prize_note is 'lottoen.com 1등 최근당첨일 텍스트 (예: "10개월 전")';
comment on column public.stores.lottoen_second_prize_note is 'lottoen.com 2등 최근당첨일 텍스트';
comment on column public.stores.lottoen_verified_at is 'lottoen.com 교차 검증 시각';
