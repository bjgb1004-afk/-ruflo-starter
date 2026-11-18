-- 같은 번호를 여러 장 산 경우 알림이 한 장분만 알려주던 것을 고친다.
--
-- 이 표의 유니크 제약은 (push_token, draw_no, numbers)였다. 같은 용지를 다시 스캔했을 때
-- 중복 등록을 막으려고 2026-08-15에 넣은 것인데(20260815090000), 같은 번호를 3장 산
-- 사람의 2·3번째 게임도 같이 막아버린다. 그러면 추첨 후 알림은 "1게임 5,000원"이라고
-- 하고 보관함은 "3게임 15,000원"이라고 해서, 같은 앱이 돈에 대해 서로 다른 말을 한다.
-- 2026-11-07 1249회에 같은 번호 3장(3,000원) 용지로 실제로 그렇게 됐다.
--
-- 그래서 "용지 안에서 몇 번째 복사본인가"를 제약에 넣는다. 같은 용지를 다시 스캔하면
-- 같은 copy_no가 다시 오므로 중복 차단은 그대로 살아 있고, 진짜 3장은 1·2·3으로 들어온다.
--
-- 지금 이 표는 0행이다(발송이 끝난 구독은 그때마다 정리된다). 제약을 바꾸기에 가장 안전한
-- 시점이라 기존 행 마이그레이션이 필요 없다.
alter table public.mylotto_push_subscriptions
  add column if not exists copy_no smallint not null default 1;

comment on column public.mylotto_push_subscriptions.copy_no is
  '한 용지 안에서 같은 번호의 몇 번째 장인가(1부터). 같은 번호를 여러 장 산 경우를 구분한다.';

alter table public.mylotto_push_subscriptions
  drop constraint if exists mylotto_push_subscriptions_unique;

alter table public.mylotto_push_subscriptions
  add constraint mylotto_push_subscriptions_unique
  unique (push_token, draw_no, numbers, copy_no);
