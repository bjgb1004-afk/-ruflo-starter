-- 회차별 당첨현황 화면에서 4등/5등 당첨자 수까지 보여주기 위해 컬럼 추가.
-- 4등/5등 당첨금 자체는 법정 고정금액(각 50,000원/5,000원, 앱 코드의 FIXED_PRIZE_AMOUNT)이라
-- 이미 알 수 있지만, 당첨자 수는 회차마다 달라 별도 저장이 필요하다.
alter table public.draw_history
  add column if not exists fourth_prize_winner_count integer,
  add column if not exists fifth_prize_winner_count integer;

comment on column public.draw_history.fourth_prize_winner_count is
  '4등 당첨자 수 (오픈소스 미러 divisions[3].winners 기준)';
comment on column public.draw_history.fifth_prize_winner_count is
  '5등 당첨자 수 (오픈소스 미러 divisions[4].winners 기준)';
