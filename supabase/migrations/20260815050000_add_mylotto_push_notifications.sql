-- "보관함에 저장한 티켓의 당첨/낙첨을 알림으로 받고 싶다"는 요청에 대응.
-- 기존 구조(useAutoCheckTickets.ts)는 티켓을 기기 로컬(AsyncStorage)에만 저장하고 앱을
-- 열 때만 대조하는 방식이라 "서버가 알아서 푸시"가 불가능했다. 로그인 없는 UX를 유지하기
-- 위해 사용자 계정 대신 "푸시 토큰 + 번호"만 익명으로 잠깐 보관하는 테이블을 둔다.
-- 결과 통보 후에는 즉시 삭제(아래 정리 로직)하므로 번호가 서버에 오래 남지 않는다.
create table public.mylotto_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  push_token   text not null,
  draw_no      integer not null,
  numbers      integer[] not null,
  purchase_type text,
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);

create index idx_mylotto_push_pending on public.mylotto_push_subscriptions (draw_no) where notified_at is null;

alter table public.mylotto_push_subscriptions enable row level security;

-- 로그인 없는 앱이라 anon 키로 insert만 허용한다(자기 토큰 등록). 조회/수정/삭제는
-- service role(알림 발송 배치)만 - 다른 사람 토큰/번호를 클라이언트에서 볼 수 없게 한다.
create policy mylotto_push_insert_anon
  on public.mylotto_push_subscriptions
  for insert
  to anon, authenticated
  with check (true);

comment on table public.mylotto_push_subscriptions is
  '보관함 티켓 당첨 알림용 임시 구독 - 알림 발송 후 정리 로직으로 삭제됨(번호를 서버에 오래 보관하지 않기 위함)';
