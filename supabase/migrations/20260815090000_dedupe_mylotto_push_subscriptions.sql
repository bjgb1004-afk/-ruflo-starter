-- 같은 용지를 실수로 재스캔하면 클라이언트가 같은 (push_token, draw_no, numbers) 조합으로
-- 구독을 또 insert할 수 있었다(중복 티켓 자체는 별도로 useMyLottoTickets.ts에서 막았지만,
-- 이 테이블은 독립적으로 계속 쌓였다) - 추첨 후 같은 결과로 푸시가 두 번 온다.
alter table public.mylotto_push_subscriptions
  add constraint mylotto_push_subscriptions_unique unique (push_token, draw_no, numbers);
