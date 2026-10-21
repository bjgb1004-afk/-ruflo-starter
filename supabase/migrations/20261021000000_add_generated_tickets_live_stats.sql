-- generated_tickets는 anon/authenticated에 select 정책이 없다(남의 생성 번호를 긁어가지
-- 못하게 일부러 잠가둠 - 20261012000000 참고). 그래서 추첨 전(아직 집계 전) 회차에 지금까지
-- 몇 게임이 나왔는지는 서버(service role)가 아니면 볼 방법이 없었다.
--
-- is_admin() 서버 검증(20260808020000)을 그대로 재사용해 관리자만 호출 가능한 RPC로
-- 열어준다 - 테이블 정책을 건드리지 않고 이 함수 하나만 RLS를 우회(security definer)한다.

create or replace function public.generated_tickets_live_stats(p_draw_no integer default null)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_draw_no integer := p_draw_no;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if v_draw_no is null then
    select coalesce(max(draw_no), 0) into v_draw_no from public.generated_tickets;
  end if;

  return (
    select json_build_object(
      'drawNo', v_draw_no,
      'total', coalesce(sum(cnt), 0),
      'bySource', coalesce(
        json_agg(json_build_object('source', source, 'games', cnt) order by cnt desc),
        '[]'::json
      )
    )
    from (
      select source, count(*) as cnt
      from public.generated_tickets
      where draw_no = v_draw_no
      group by source
    ) t
  );
end;
$$;

comment on function public.generated_tickets_live_stats(integer) is
  '추첨 전(집계 전) 회차의 생성 번호 현황을 코너별로 보여준다. 관리자만 호출 가능
   (is_admin() 서버 검증) - generated_tickets는 select 정책이 없어 이 함수가 유일한 조회 경로다.';
