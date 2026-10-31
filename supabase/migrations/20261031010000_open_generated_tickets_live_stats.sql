-- generated_tickets_live_stats(20261021000000)는 관리자만 호출 가능했다. 하지만 이 함수가
-- 돌려주는 건 코너별 "게임 수"뿐 - 번호도, 식별자도 없는 순수 집계라 generator_stats
-- (20261012000000, 추첨 후 집계)와 똑같이 누구나 봐도 안전하다. 생성기 화면의 "지금 인기"
-- 랭킹(추첨 전, 실시간)에 쓰려면 일반 사용자도 호출할 수 있어야 해서 is_admin() 검증을
-- 뗀다. generated_tickets 테이블 자체의 select 정책은 그대로 막혀 있다 - 이 함수(security
-- definer)만 그 테이블을 들여다보고 집계 결과만 내보낸다.

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

grant execute on function public.generated_tickets_live_stats(integer) to anon, authenticated;

comment on function public.generated_tickets_live_stats(integer) is
  '추첨 전(집계 전) 회차의 생성 번호 현황을 코너별로 보여준다. 번호·식별자 없는 순수 집계라
   누구나 호출 가능 - generated_tickets는 여전히 select 정책이 없어 이 함수가 유일한 조회 경로다.';
