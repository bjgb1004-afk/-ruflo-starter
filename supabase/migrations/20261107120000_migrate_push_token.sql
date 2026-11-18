-- 한 폰이 같은 회차로 알림을 두 통 받는 것을 막는다.
--
-- 2026-11-07(1249회)에 실제로 그렇게 됐다: 스토어 앱 하나만 깔린 폰에 "저장한 번호
-- N게임이 당첨권" 알림이 두 통 왔다. 발송은 push_token으로 묶는데(한 기기 한 회차 한 통),
-- 폰의 푸시 주소는 영구적이지 않다 - 앱 데이터 삭제·재설치·FCM 주소 갱신으로 바뀐다.
-- 주소가 바뀌면 그 전에 등록된 줄은 옛 주소를 그대로 들고 남아 있고, 옛 주소도 한동안은
-- 같은 폰에 배달되기 때문에 양쪽이 각각 한 통씩 간다.
--
-- 서버는 두 주소가 같은 폰인지 알 방법이 없다. 아는 건 폰 자신뿐이다(직전에 등록한 주소를
-- 기억해두면 된다). 그래서 폰이 "내 주소가 이것에서 저것으로 바뀌었다"고 알려줄 창구만
-- 열어주고, 옮기는 일은 서버가 한다 - 이 표는 anon에게 insert만 열려 있다(남의 번호와
-- 알림 주소가 들어 있어 읽기·수정을 열 수 없다. 그래서 security definer가 필요하다).
--
-- 고정 기기 식별자를 새로 만들지 않는다. 그건 추적용 식별자가 되어 Play 데이터 보안
-- 선언을 건드리고, 지금 필요한 일(옛 줄을 새 주소로 잇기)에는 과하다 - 폰이 이미 서버에
-- 보낸 값인 푸시 주소만으로 충분하다.
create or replace function public.migrate_push_token(p_old text, p_new text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  if p_old is null or p_new is null or p_old = p_new then
    return 0;
  end if;

  -- 아직 통보되지 않은 줄만 손댄다. 이미 보낸 줄은 곧 정리 대상이고, 옮기면 두 번 보낸다.
  --
  -- 같은 (회차, 번호)가 새 주소에도 이미 등록돼 있으면 옮길 수가 없다
  -- (mylotto_push_subscriptions_unique = push_token, draw_no, numbers). 그 경우 옛 줄은
  -- 지운다 - 새 줄이 같은 내용을 이미 담고 있으니 잃는 게 없다.
  delete from public.mylotto_push_subscriptions as stale
  where stale.push_token = p_old
    and stale.notified_at is null
    and exists (
      select 1
      from public.mylotto_push_subscriptions as fresh
      where fresh.push_token = p_new
        and fresh.draw_no = stale.draw_no
        and fresh.numbers = stale.numbers
    );

  update public.mylotto_push_subscriptions
  set push_token = p_new
  where push_token = p_old
    and notified_at is null;

  get diagnostics moved = row_count;
  return moved;
end;
$$;

comment on function public.migrate_push_token(text, text) is
  '푸시 주소가 바뀐 폰의 미통보 구독을 새 주소로 잇는다. 한 회차에 두 통 가는 것을 막는 장치.';

grant execute on function public.migrate_push_token(text, text) to anon, authenticated;
