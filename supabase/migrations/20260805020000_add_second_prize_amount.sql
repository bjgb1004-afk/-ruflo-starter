-- 세금 계산기 기능(가상 당첨 체험)을 위해 회차별 2등 금액 정보 추가.
-- 동행복권 공식 API(getLottoNumber)는 1등 정보만 제공하므로, 2등 금액은
-- 오픈소스 미러(smok95/lotto)의 divisions[1]에서 별도로 가져와 채운다.
alter table public.draw_history
  add column if not exists second_prize_amount_per_win bigint,
  add column if not exists second_prize_winner_count integer;

comment on column public.draw_history.second_prize_amount_per_win is
  '2등 1인당 당첨금액 (오픈소스 미러 divisions[1].prize 기준)';
comment on column public.draw_history.second_prize_winner_count is
  '2등 당첨자 수 (오픈소스 미러 divisions[1].winners 기준)';
