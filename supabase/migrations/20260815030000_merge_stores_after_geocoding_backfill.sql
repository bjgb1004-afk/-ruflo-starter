-- scripts/backfillCoordinates.ts로 플레이스홀더 좌표(37.5, 126.9)를 실좌표로 채운 매장 중
-- 4곳이, 실좌표를 얻고 나서야 이미 DB에 있던 다른 매장과 "도로명+번지 완전동일, 건물명/부가
-- 설명만 다름"인 근접중복으로 드러났다. 전부 주소 접두어 일치가 확인되어 병합 확정.
do $$
declare
  v_pair record;
begin
  for v_pair in
    select * from (values
    ('09ce9c23-dcc7-5715-936f-6288fed097ed'::uuid, '1ec1e073-e2cc-4f81-8094-23befe98debd'::uuid), -- 이마트24 순천산단점
    ('cf4f4113-9628-43c1-8cfc-4f2cbd108192'::uuid, '3f0c1ed5-9f22-43fd-b4d7-e8a257a9d338'::uuid), -- 한가람마트(슈퍼마켓)
    ('71497782-00f2-4ba2-a001-7ab9b4de85ca'::uuid, '40fdb5e4-013d-4c93-8b8d-3124c582e42a'::uuid), -- 좋은날 복권방
    ('be3311ae-0122-5681-96a3-cf608e3ca665'::uuid, '80ad6421-31b4-44ef-8259-56ff26d14648'::uuid)  -- 돈벼락맞는곳 (부산 사상구)
    ) as t(dup_id, canonical_id)
  loop
    if exists (select 1 from public.stores where id = v_pair.dup_id)
       and exists (select 1 from public.stores where id = v_pair.canonical_id) then
      perform public.merge_duplicate_store(v_pair.dup_id, v_pair.canonical_id);
    end if;
  end loop;
end $$;

select public.refresh_store_ranking_stats();
