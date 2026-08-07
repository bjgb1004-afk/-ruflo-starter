-- 3등도 1~2등과 마찬가지로 회차별 변동(파리뮤추얼) 금액이다. 그동안 앱 코드에서
-- 3등을 1,500,000원 고정으로 잘못 계산하고 있었던 것을 바로잡기 위해 컬럼을 추가한다.
-- (4~5등만 실제로 법정 고정금액: 각 50,000원/5,000원)
alter table public.draw_history
  add column if not exists third_prize_amount_per_win integer,
  add column if not exists third_prize_winner_count integer;

comment on column public.draw_history.third_prize_amount_per_win is
  '3등 1인당 당첨금(원). 1~3등은 모두 회차별 변동 금액이며 고정값이 아니다.';
