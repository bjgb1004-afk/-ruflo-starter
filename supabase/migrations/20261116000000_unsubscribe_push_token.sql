-- 설정의 "저장한 번호 추첨 알림"을 끈 폰이 이미 등록해둔 구독을 멈출 창구.
--
-- 이게 없으면 스위치가 거짓말을 한다: 껐어도 그 전에 보관함에 저장한 번호는 서버에
-- 등록된 채로 남아 다음 추첨 뒤에 알림이 한 통 더 간다. "껐는데 또 왔다"는 신고가
-- 나올 자리다.
--
-- 이 표는 anon에게 insert만 열려 있어(남의 번호와 알림 주소가 들어 있어 읽기·수정·삭제를
-- 열 수 없다) 클라이언트가 직접 지울 수가 없다. 그래서 migrate_push_token과 똑같이
-- security definer 함수로 창구만 낸다.
--
-- 열리는 범위는 migrate_push_token과 같다: 푸시 주소를 아는 쪽이 그 주소의 미통보 구독에
-- 손댈 수 있다(옮기기 vs 지우기). 주소는 폰이 이미 서버에 보낸 값이고 추측할 수 없는
-- 문자열이라, 새로운 종류의 노출이 생기는 것은 아니다. 고정 기기 식별자는 새로 만들지
-- 않는다 - 추적용 식별자가 되어 Play 데이터 보안 선언을 건드린다.
create or replace function public.unsubscribe_push_token(p_token text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if p_token is null or p_token = '' then
    return 0;
  end if;

  -- 아직 통보되지 않은 줄만 지운다. 이미 보낸 줄은 발송 배치의 정리 대상이고, 여기서
  -- 건드려도 멈출 알림이 없다.
  delete from public.mylotto_push_subscriptions
  where push_token = p_token
    and notified_at is null;

  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.unsubscribe_push_token(text) is
  '그 푸시 주소의 미통보 구독을 지운다. 설정에서 추첨 알림을 끈 폰이 쓰는 창구.';

grant execute on function public.unsubscribe_push_token(text) to anon, authenticated;
