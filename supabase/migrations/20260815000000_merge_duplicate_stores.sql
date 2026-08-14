-- 중복 매장 데이터 병합. 배경: 이름+주소가 완전히 동일한 stores 행이 다수 존재(수집
-- 배치가 서로 다른 소스/회차에서 같은 매장을 다른 id로 upsert한 것으로 추정). nearby_stores()가
-- stores를 그대로 마커로 뿌리기 때문에, 지도에 같은 위치 마커가 두 개 찍히고 한쪽만
-- store_ranking_stats가 매칭돼 순위가 보였다 안 보였다 하는 버그의 근본 원인이었다.
--
-- store_ranking_stats는 draw_history를 집계한 파생 테이블이므로(refresh_store_ranking_stats),
-- 병합의 정답은 draw_history.first_prize_store_ids/second_prize_store_ids 배열 안의 중복 id를
-- canonical id로 치환하는 것 하나로 충분하다 - 이후 refresh_store_ranking_stats()를 다시 돌리면
-- "양쪽 다 당첨이력이 있던" 케이스까지 자동으로 올바르게 합산된다.
do $$
declare
  v_group record;
  v_canonical_id uuid;
  v_dup_id uuid;
begin
  for v_group in
    select array_agg(id order by created_at asc, id asc) as all_ids
    from public.stores
    group by name, address
    having count(*) > 1
  loop
    v_canonical_id := v_group.all_ids[1];

    foreach v_dup_id in array v_group.all_ids loop
      continue when v_dup_id = v_canonical_id;

      update public.draw_history
      set first_prize_store_ids = (
        select array_agg(distinct x) from unnest(
          array_replace(first_prize_store_ids, v_dup_id, v_canonical_id)
        ) as x
      )
      where v_dup_id = any(first_prize_store_ids);

      update public.draw_history
      set second_prize_store_ids = (
        select array_agg(distinct x) from unnest(
          array_replace(second_prize_store_ids, v_dup_id, v_canonical_id)
        ) as x
      )
      where v_dup_id = any(second_prize_store_ids);

      -- draw_first_prize_methods: PK(draw_no, store_id) - 이미 canonical 쪽에 같은 회차 행이
      -- 있으면 충돌하므로 그 경우만 dup 행을 버리고, 나머지는 canonical로 이전한다.
      update public.draw_first_prize_methods m
      set store_id = v_canonical_id
      where store_id = v_dup_id
        and not exists (
          select 1 from public.draw_first_prize_methods m2
          where m2.draw_no = m.draw_no and m2.store_id = v_canonical_id
        );
      delete from public.draw_first_prize_methods where store_id = v_dup_id;

      update public.store_owner_profiles
      set store_id = v_canonical_id
      where store_id = v_dup_id
        and not exists (select 1 from public.store_owner_profiles where store_id = v_canonical_id);
      delete from public.store_owner_profiles where store_id = v_dup_id;

      update public.store_owner_verification_attempts
      set store_id = v_canonical_id
      where store_id = v_dup_id;

      update public.store_ownership_transfer_requests
      set store_id = v_canonical_id
      where store_id = v_dup_id;

      update public.user_favorite_stores f
      set store_id = v_canonical_id
      where store_id = v_dup_id
        and not exists (
          select 1 from public.user_favorite_stores f2
          where f2.user_id = f.user_id and f2.store_id = v_canonical_id
        );
      delete from public.user_favorite_stores where store_id = v_dup_id;

      -- store_ranking_stats는 stores FK on delete cascade로 자동 삭제됨
      delete from public.stores where id = v_dup_id;
    end loop;
  end loop;
end $$;

-- 병합된 draw_history 기준으로 통계/순위 재계산
select public.refresh_store_ranking_stats();
