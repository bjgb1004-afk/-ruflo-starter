-- 푸시 구독에 "실제로 산 번호인지"를 기록한다.
--
-- 왜 필요한가: 지금까지 구독은 QR 스캔(=돈 내고 산 복권)에서만 등록됐다. 생성기에서 뽑은
-- 번호도 등록하게 넓히면서, 서버 발송(sendMylottoNotifications.ts)이 두 경우를 구분해야
-- 한다 - 안 산 번호에 "당첨을 축하합니다"는 받을 수 없는 돈을 축하하는 거짓말이고,
-- 안 산 번호의 낙첨은 알릴 가치가 없다(앱 안 성적표가 "사지 않았다면 받을 수 없는
-- 금액"이라고 밝히는 것과 같은 원칙이다).
--
-- default true인 이유: 이 칸이 없던 시절의 구독은 전부 QR 스캔에서 온 것이라 산 번호다.

alter table public.mylotto_push_subscriptions
  add column if not exists purchased boolean not null default true;

comment on column public.mylotto_push_subscriptions.purchased is
  '실제로 돈을 내고 산 번호인지. QR 스캔은 true, 생성기에서 저장한 번호는 false.
   발송 문구가 이 값으로 갈린다 - false에는 당첨을 축하하지 않고 낙첨도 알리지 않는다.';
