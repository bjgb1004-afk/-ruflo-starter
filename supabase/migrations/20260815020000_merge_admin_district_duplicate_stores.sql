-- 이전 마이그레이션(20260815010000)에서 자동병합 대상(주소 접두어 일치)에서 제외됐던 36쌍을
-- 수동 검토한 결과. 판정 기준:
--   1) 같은 이름 + 좌표 완전동일 + 이 좌표를 쓰는 매장이 딱 2곳뿐 (전국에 흩어진 매장들이
--      우연히 겹치는 "폴백 좌표"가 아님이 확인됨) + 도로명/번지가 실질적으로 동일하고
--      읍/면/동 행정구역 표기만 있거나 없는 차이 → 같은 매장으로 판정, 병합.
--   2) 도로명+건물번지는 동일한데 건물 내 설명(동/호/건물명)만 다른 경우 → 같은 매장으로 판정, 병합.
--   3) 번지수 자체가 다른 경우(예: "종로 331" vs "종로 333", 15.2m 이격) → 인접한 별개
--      매장일 가능성을 배제할 수 없어 자동병합에서 제외. 이런 경우는 매장 데이터(당첨이력)를
--      잘못 합치는 사고가 순위 오류보다 훨씬 심각하므로 보수적으로 남겨둔다.
--
-- 참고: 이번 조사에서 "인천 서구/중구/동구" 매장 이름으로 보였던 근접중복 11쌍(152개 매장)은
-- 사실 전국 각지의 서로 무관한 매장들이 VWorld 지오코딩 실패로 플레이스홀더 좌표(37.5, 126.9)에
-- 전부 겹쳐 찍힌 것으로 확인되어 병합 대상에서 완전히 제외했다 - scripts/backfillCoordinates.ts
-- 재실행으로 이 중 4건은 실좌표 확보, 149건은 여전히 실패(주소 형식 문제)로 별도 조치 필요.

do $$
declare
  v_pair record;
begin
  for v_pair in
    select * from (values
    ('0be2da34-dd70-5589-84d6-52830d74a0d2'::uuid, 'f0fbeab3-4665-4054-a3fb-bba063dd97f0'::uuid), -- 복권판매점
    ('492e6d0f-6114-5a0d-921b-d34cf54485b6'::uuid, 'aa17ad04-c113-4804-900b-679741bda186'::uuid), -- 로또명당
    ('3d2fcb88-6aa2-53c8-9e9b-05006218939b'::uuid, 'b1ddb576-0088-42f0-bb71-796238ac8301'::uuid), -- 복권나라
    ('d4bf1d77-f799-501e-aa8e-bd048e2ed627'::uuid, 'e351e704-53cc-45fd-acab-24e13c29e325'::uuid), -- 홈런복권방
    ('1ce19443-dce3-5703-b651-2e1541ad5d41'::uuid, '2f02fc74-cdd3-43bf-a3f8-e2ed4833f72d'::uuid), -- 충청복권전문점
    ('d2ce7b97-fd36-5ceb-b839-dd67035001d6'::uuid, 'ea6f5118-40ea-4bd7-8f04-6f1b2fb4cd83'::uuid), -- 둔전행운복권방
    ('3c27ed84-786a-53fc-a527-f4ed3d1f83ab'::uuid, 'd64469c2-187e-464d-b1a0-88271b62d3b3'::uuid), -- 스포츠복권방
    ('4f3a9243-6f6e-5e46-884b-40e0b49f2901'::uuid, '5efe089b-9662-4eaa-b432-b54fc88a48a9'::uuid), -- 복권닷컴
    ('78f4435c-7ff5-5335-a326-88aaa3ce6da4'::uuid, 'e57960c0-981a-47be-863e-32527b2b4bff'::uuid), -- 명당복권방
    ('486b1d57-9ad9-5b78-a7b0-4171f0871f0d'::uuid, '92ffeaec-feeb-4021-ab48-f1dd8ecbf8f3'::uuid), -- NG24
    ('803540ae-964e-5b40-9c1d-44b6c19ffad4'::uuid, '9931ade7-1b96-4d3e-8f74-452df503087a'::uuid), -- 대박찬스로또복권방
    ('3a8c8a2f-99ad-5ef2-8c70-f87a63bb86ef'::uuid, 'c236f956-e368-44f2-aeb8-481304935055'::uuid), -- 신라슈퍼
    ('7b5739fd-6ea2-5483-b212-60d907bb6879'::uuid, 'cd91440b-458c-497e-9cec-2c1a379b6bbe'::uuid), -- 샘복권방
    ('157cdec5-7f86-55cd-b778-9ab66945e687'::uuid, 'ece2bd6b-192f-43c8-baee-e7543b513178'::uuid), -- 광양복권나라(로터리)
    ('68137214-7024-549f-95c1-2351717973f8'::uuid, '7faddc55-d911-41fc-aba3-cbe82ca1a93e'::uuid), -- 복권판매점 명지국제신도시점
    ('dc2c9e85-1703-5784-8e92-e4bdadbbe3c2'::uuid, 'f77163c8-18c3-4432-bd32-97c598a98323'::uuid), -- 훼밀리복권
    ('e23608fc-ba2f-481b-ae12-e520fbffbf6b'::uuid, '0d0a6f7b-ece6-5746-a82e-59b39eb25ca9'::uuid), -- 거진터미널로또복권판매점
    ('fdcfaec5-e10b-4ba7-9430-2078120701fd'::uuid, '9fafc610-164a-58c7-86db-051e8511d2bb'::uuid), -- 서원탑훼미리
    ('9cf91ae5-f162-5ed6-98ff-3d402b344101'::uuid, 'c9cc7e73-92e5-4726-a44b-c6333dfcac12'::uuid)  -- 대박복권방(연천군, 도로명/지번 별칭)
    ) as t(dup_id, canonical_id)
  loop
    if exists (select 1 from public.stores where id = v_pair.dup_id)
       and exists (select 1 from public.stores where id = v_pair.canonical_id) then
      perform public.merge_duplicate_store(v_pair.dup_id, v_pair.canonical_id);
    end if;
  end loop;
end $$;

select public.refresh_store_ranking_stats();
