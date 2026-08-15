-- 배경: 20260815000000 마이그레이션은 "이름+주소 완전일치" 중복만 병합했다. 이후 전국
-- 13,849개 활성 매장 전수조사 결과, 주소 표기만 다른(건물명 접미사 추가, "제 제" 등 중복토큰,
-- 앞자리 생략 등) 근접 중복 143건이 추가로 발견됐다 - 같은 이름 + 좌표 완전동일(0.0m) +
-- 한쪽 주소가 다른쪽의 접두어인 경우만 "진짜 같은 매장"으로 보고 자동병합 대상으로 삼았다.
-- (도로명 자체가 다른 경우는 지오코딩 실패로 행정동 중심좌표에 우연히 겹친 별개 매장일 수
-- 있어 자동병합에서 제외 - 예: "종로 331" vs "종로 333", "대박복권방" 3개의 서로 다른 도로.
-- 이런 케이스는 병합 시 서로 다른 실제 매장의 당첨이력이 잘못 합쳐지는 사고로 이어진다.)
--
-- 지도에서 "메달 배지 마커 위에 회색 점 마커가 겹쳐 찍힘", "추천 TOP3에 2위/3위가 각각
-- 2개씩 표시되고 숫자가 안 보임" 버그의 원인이 바로 이 근접 중복 stores 행들이다 - 물리적으로
-- 같은 매장이 store_id가 달라 지도에 마커 두 개로 찍히고, topRecommendRanks가 store_id 기준
-- Map이라 같은 순위가 서로 다른 두 마커에 할당되는 것처럼 보인다.

-- 20260815000000의 병합 로직을 재사용 가능한 함수로 추출 (143건을 매번 반복 작성하지 않기 위함).
create or replace function public.merge_duplicate_store(v_dup_id uuid, v_canonical_id uuid)
returns void
language plpgsql
as $$
begin
  if v_dup_id = v_canonical_id then
    return;
  end if;

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
end;
$$;

do $$
declare
  v_pair record;
begin
  for v_pair in
    select * from (values
    ('3599fcfc-0085-5c48-8d62-9c64320af947'::uuid, 'fd150d6f-8ac0-48bc-9a7a-6a2f3b0fe7e0'::uuid),
    ('f91a0d82-97b6-4067-8b9e-1af82c7c7ec2'::uuid, '5af7dbea-7ed9-5282-9122-e60219448e9a'::uuid),
    ('427426b3-5da4-575a-aa3f-4e4fc49f41d9'::uuid, 'bd70a8cc-fed9-4881-b466-dae5cb0c4c8f'::uuid),
    ('93a8a49c-ac09-5824-871b-b64052d8c754'::uuid, 'dbf2b8c4-2293-410b-a98d-a0cb1f83ac3f'::uuid),
    ('44c11d4e-6bd1-5d05-a17c-93de874bf7c2'::uuid, '78da36f9-6e48-4367-9022-c2a6e070367d'::uuid),
    ('206c6ae4-2ff1-5364-8682-e9b135dc2bb0'::uuid, '4a3abae5-55d5-41be-bd2a-0cd9e25b48af'::uuid),
    ('a9184695-e9d3-5e4e-8f77-35854da197f9'::uuid, 'bb51fb61-8f32-4734-aa68-11696072e23c'::uuid),
    ('05a6c5c5-3fbe-5091-9d3c-bdbdf73924f0'::uuid, 'd163db80-49ad-4808-bbf8-44024e02575f'::uuid),
    ('65a3b541-72fd-5dc7-a7cb-62da32009c94'::uuid, 'f31d9ab5-ab0e-4a16-8315-f4f9189244c5'::uuid),
    ('04604fa4-ee93-5f26-a395-72c7446da498'::uuid, '27498646-39a3-45cd-ba34-2fa6587c4941'::uuid),
    ('b323bc71-48bd-5f1d-a565-5f2ec8a1ad45'::uuid, 'f000d6db-c015-47ca-b7e3-7a7f1a1925ac'::uuid),
    ('44b7328b-1207-5857-b5b3-6febaddf9f91'::uuid, '514e72b1-0541-4a2b-87bf-c49d82ed0836'::uuid),
    ('3faccab1-6dfe-59dc-bde3-136a3b8103e6'::uuid, '608905ab-afcb-4025-aa79-a70bb23add55'::uuid),
    ('0ff5d187-db5b-5e04-b79e-8b686401c8d6'::uuid, '865db487-a68b-481f-b344-3486630c6282'::uuid),
    ('3a92e7fe-b89b-5c61-8dcc-1d3a9ab577c8'::uuid, '47ba8649-1f3c-4f72-adec-6b00fed88077'::uuid),
    ('a22626ed-08ed-4ec1-a293-3532c48e0f21'::uuid, '98dbaa62-3f36-5ba2-85f1-43da3067603d'::uuid),
    ('b49153ac-3e21-43fe-b2ea-345713f33315'::uuid, '7bbd3cc5-dc65-5229-bd1d-8609422d2c87'::uuid),
    ('520c73ce-f3cd-5760-a9d7-864189dc7031'::uuid, '65ee60f1-9888-4c84-a155-b3b1429f6cbe'::uuid),
    ('04215c57-5cfb-51f6-ac1e-d9ad01d881b5'::uuid, '6d57bd35-38bd-4080-8229-7cfd47b2359d'::uuid),
    ('50525ee9-e1d8-40bb-8b6f-d127dd2a57c0'::uuid, '2041be15-5b6e-5767-aa0a-60484643c082'::uuid),
    ('035e7fc4-4d17-5118-a7c4-de07a18508fc'::uuid, '19052aa2-8ee6-4b3f-b62e-237db32670e3'::uuid),
    ('ccb9af20-2075-4b68-9158-e1898d5f3656'::uuid, '4b1d2107-ee59-5226-9385-9c7a1a0f7007'::uuid),
    ('534a5718-f26e-5497-b224-b1f91cece830'::uuid, '72f167ac-ca0f-42e7-97dc-c50603a610c7'::uuid),
    ('44e941da-7bcd-525d-943b-f706e4c22bca'::uuid, 'e2526049-f8fe-483d-a2be-458f01b677bc'::uuid),
    ('a72ee5ba-0bb6-5156-ac3b-5ee526cd1918'::uuid, 'de6b8362-0b7f-47be-b0f1-1c7d4c0c7123'::uuid),
    ('0b460295-5c95-5e08-9d5a-b9564d04beab'::uuid, 'e5182263-af6f-4286-ae7b-6d0a887ee2bc'::uuid),
    ('610792fe-a949-559d-849a-c28c82152e03'::uuid, 'b8cac0b7-230f-43be-92b3-05448dff7abc'::uuid),
    ('329d554e-d4ef-574f-8331-d1c70df91ac2'::uuid, '5f3850e3-bada-43a8-84d6-f1d382af712a'::uuid),
    ('1e292cd4-9dd9-51c3-90b7-167895b37229'::uuid, '9e02c07b-1181-484d-8ee5-1a03a5c0ec8b'::uuid),
    ('8350346a-9c98-5307-9279-06805780807a'::uuid, '8dc54f39-ee46-4e09-8257-b7f1b87a5beb'::uuid),
    ('779d365b-f594-5cac-9764-19f23cd15377'::uuid, '81cbb153-3429-482c-bd52-6d8db3a456dc'::uuid),
    ('3b2bbbc2-772e-5546-8ec7-31dc4ad2b7cf'::uuid, 'af4b1508-fa8e-448d-9a3e-5ec61c62b3b1'::uuid),
    ('7bf6727e-1986-58f5-948b-59506ab69ba5'::uuid, 'd782e4cb-deda-4672-bb3e-c9729e0487f2'::uuid),
    ('ea69d9e7-fd37-5a51-a095-3b107ee97305'::uuid, '59ca40b5-42f6-4cc0-b0c4-b2d401b72e0c'::uuid),
    ('57bc61aa-e4c3-5fb0-b37e-468ce76fa60a'::uuid, '6350e0cd-6145-46b2-96d0-9de092e66f0c'::uuid),
    ('31ca6c2b-e147-5eb4-97d7-84a5bb7f2697'::uuid, '3d6b0900-5d1d-485b-9c3a-848394024736'::uuid),
    ('ad431b0b-76a8-536e-807e-d7686da37e26'::uuid, '2bef769b-ae9a-4d23-9d89-29bd4b39c82a'::uuid),
    ('56dd4f73-152c-4f08-84c8-8f1b1ae15bd7'::uuid, '1d4b866c-a86b-5a3e-bedd-5b78d345ee9a'::uuid),
    ('2b348d86-6c83-53b3-9b59-d9b1c5649f2b'::uuid, '8daf86f3-53b7-492c-bc1a-aa945d5a9ca6'::uuid),
    ('3d1abe7e-3888-5fe4-90cd-1d3f72a3defb'::uuid, '99dea929-8dca-4552-886e-aa1966f0bd30'::uuid),
    ('717c4ce8-d42c-54df-9490-998d0db30bfe'::uuid, 'afe657e1-ab54-478e-ab2a-4ca9798e1896'::uuid),
    ('86280ee4-5ccf-5ba2-8713-b68a22d6686c'::uuid, 'b899da50-1b14-444e-879d-79c52fa2619e'::uuid),
    ('45a9efe6-3d59-5733-9345-9539759e225c'::uuid, 'd74268e8-e01b-48be-a4c4-424e0ea4b445'::uuid),
    ('77a8b59a-cd49-5665-a88b-f747deca024c'::uuid, 'dafe529c-1fa7-4202-8d11-a8a7a6b32550'::uuid),
    ('ec8d6857-9307-4b97-8aa1-d023250e9459'::uuid, 'c044bae2-01f2-5727-850e-9388ffb17a51'::uuid),
    ('0f8b5397-d105-5647-92dc-2507e8abbdf6'::uuid, '99aac41f-ab0a-4bd7-8fd4-229c2d167322'::uuid),
    ('c9d18c1b-11c6-4cb2-aabe-23d1188e3ed0'::uuid, 'b760bffe-e24d-5166-adef-37d4d8a1105f'::uuid),
    ('246618ed-73ff-582b-9982-048798c3abf0'::uuid, '482a7590-0b31-4d8a-8594-bb3ce098e9c8'::uuid),
    ('c5311412-8572-5bfa-ad15-58fc913e3c35'::uuid, 'ffb44054-549d-4222-ba87-7129bb5386ff'::uuid),
    ('b5eda678-b14d-5f35-a383-ee6cb1a0bbea'::uuid, 'c5644994-d227-4b1f-99a1-88bbcef62404'::uuid),
    ('ba05b260-0a3c-48fb-a207-d2719c9cec8a'::uuid, 'a9a2f64a-1f8d-538e-9ba3-77557e81e5b0'::uuid),
    ('78132d0f-a56e-5d87-9311-2ee83564c02b'::uuid, 'd3f0d2a4-0b34-4f22-92d2-ad8d3cbf0bf8'::uuid),
    ('805878db-e24c-5228-903b-5462c8360297'::uuid, '99aaea87-33b4-47ef-ab62-44a90304818f'::uuid),
    ('41fdcae1-a1f1-531a-aece-d5104939871d'::uuid, 'd961baa6-997a-457e-82d4-e63c55ab34ab'::uuid),
    ('7eaa0cea-2a54-59c8-95fe-a81237d24162'::uuid, 'e06f54fb-f22d-4edc-baaa-c98d7cc9bdd7'::uuid),
    ('d66f2906-073e-4782-a685-393d7777daea'::uuid, '293345d8-1632-52a2-9607-02a19dfe62d6'::uuid),
    ('895c5cb9-2903-50b8-b889-90132e5ab04f'::uuid, 'ff5ac40b-0031-4e1c-a38e-7fd4cb71043f'::uuid),
    ('690a9ecf-e111-5244-83c6-d2e7f3fc6447'::uuid, 'd596261f-581e-4efa-a053-9f1aa513f7a5'::uuid),
    ('5ac47111-63da-5231-905b-04e6da1a1c40'::uuid, 'ebb4e98f-c1b9-4721-a35f-466f76f10740'::uuid),
    ('83127e80-5985-5d81-af91-a43a0f280e58'::uuid, '83b55afe-1a81-4d5c-b7c3-2f63de1dcce1'::uuid),
    ('ec14c3c8-d2de-4a6b-a365-d719fd20fdda'::uuid, '80bebc15-62b0-59c8-bb33-a9c062e1439a'::uuid),
    ('a71edb70-386e-5fc8-a37d-b2c90b404acf'::uuid, 'd7d8e13d-ca48-48f2-867b-f7aa00d5efe1'::uuid),
    ('a5cd225a-0b7a-517e-8525-cfb9b8cdc413'::uuid, 'e1a145c3-22dd-46da-ae8b-a1f3f163e204'::uuid),
    ('44e64b47-b048-5de0-b1df-0e8beae093f3'::uuid, '72f4c6f6-38e6-42c1-851b-12ef3e7d1e62'::uuid),
    ('241a4308-e5c7-58dd-9e2d-e5b796ff70f9'::uuid, 'f6689e32-32f2-49d8-85b7-d2af33452a8b'::uuid),
    ('0537867f-0bc8-593a-99b5-660bb8500df5'::uuid, 'c228e746-021e-4d5b-b9e0-ba4fb3a466a6'::uuid),
    ('4c1481ad-a525-5593-b373-852d56f348c8'::uuid, '7da070b5-ffde-4dcb-b81a-3c01cfd94b03'::uuid),
    ('260a6a58-0014-5c0c-a815-b8e2b0067cc0'::uuid, 'de52a607-17c1-45a9-a9e6-92088260b057'::uuid),
    ('12459a12-7be9-552d-afb2-db1464686219'::uuid, '5c804df4-0dbe-4a78-9386-f2ebffc753e9'::uuid),
    ('55911a7b-40c8-500a-869a-3ff2cd14d2cb'::uuid, '822f0782-2c33-4964-8753-5de26237d8db'::uuid),
    ('a0b3673e-e5b8-4234-a57e-b4e46cfe6b52'::uuid, '055e0315-567d-5727-8f6a-ac46f19468ac'::uuid),
    ('834f8d7e-77cd-58d7-b734-c938b6ea7fbd'::uuid, 'b2e160a4-c62c-4d62-865e-026ae14fbd60'::uuid),
    ('0d18638f-dc06-58b0-825a-a70679372151'::uuid, 'b5ebd563-5dcd-40e3-ac1b-6ba6b35b36b6'::uuid),
    ('2910da10-3946-5fe3-950c-419faef2c458'::uuid, '3362f5d2-a328-4b92-bc3e-41001cf3517c'::uuid),
    ('744ab757-a7dd-5e00-a9e5-bde40f4de981'::uuid, 'b2b03d7b-d16d-4a4b-ba4f-4a601cc82e68'::uuid),
    ('59757dd2-3859-5bb5-8391-4e18d450324c'::uuid, 'c3db5d94-bfb9-4ec7-ac1f-6a34965e8a19'::uuid),
    ('f1dc19e8-6e4b-4845-8201-299950e0fe6d'::uuid, 'f0d0f865-a45c-5024-aec9-0f67ed5a6c1d'::uuid),
    ('02ad58fd-638b-5a0f-a20b-e26b6cc7f089'::uuid, '38b76aba-84af-4949-a369-fd312454051e'::uuid),
    ('488994ab-37e3-5eeb-b55f-21860b53d4c0'::uuid, '4ea5e7c0-1e60-484a-ba0c-e18618b9add4'::uuid),
    ('59761c9d-de98-5109-9625-753dd4566c7f'::uuid, '9b6b4ec6-1010-4168-b964-a8e82b2678ce'::uuid),
    ('26de3e79-8366-5d14-867e-0046905be6e3'::uuid, 'a7aacd15-cc0f-4c07-85cd-4020d6319e31'::uuid),
    ('bb661f03-f57d-5b82-a763-b6dfc1e712d4'::uuid, '45f4ec15-f9ed-49b8-904d-11ed6dd40523'::uuid),
    ('ff8e8b28-1ecf-4ff4-b7d9-d7c4fd25355c'::uuid, 'ab1fcbfb-1388-50cb-8d5e-70b35360d875'::uuid),
    ('2b7bb18c-1c77-4f6e-875d-fd1cb579b748'::uuid, '0521d274-7cdb-5f96-82e1-d6ed1ee290c3'::uuid),
    ('f7802f86-d905-41eb-bf0a-ad599ed10c7f'::uuid, '14e597e7-d848-5d07-a67b-080fe2df224a'::uuid),
    ('d08e7caa-1693-52e2-8e0f-f922f7f70130'::uuid, 'f1e2c664-3b15-4d92-9c5b-afc4c9fed20d'::uuid),
    ('4b85f73b-56b1-5da3-9e65-1be417cb1b7c'::uuid, 'fc6ea4d4-2422-4d56-827b-4a9b7e4b33d5'::uuid),
    ('cedd7713-7ad5-429d-ade5-40f99ff12f6c'::uuid, '5d938ca1-c05e-5cb1-8ece-fc1e6eff4dd8'::uuid),
    ('007a2e9e-4e1d-5be0-930e-ff27c7238269'::uuid, 'acb56074-1cd9-45c3-90e4-784b6b42598b'::uuid),
    ('1e1ab99b-a16c-5a06-a14f-8c1d1994aea2'::uuid, '614ef8f2-c5a1-401e-b0f0-b5a2a6dcfa49'::uuid),
    ('7a6474c0-b9a6-471e-b76d-c087e88897f6'::uuid, '1a977d96-5fe4-53c2-8112-e7df0feca342'::uuid),
    ('39aa95db-1a2a-577d-b2a6-6a3a65635697'::uuid, 'bae664db-3025-4adc-81b6-394f9ebae77c'::uuid),
    ('5c73d002-8011-593f-8778-0079007f00a6'::uuid, 'cd31d3a6-1c9b-4c16-80f3-55d6cb0621fc'::uuid),
    ('5f7a2ec7-8585-51d8-af07-771d6bff6cdf'::uuid, 'a228b665-8f3b-4c32-8d80-912d2cac683c'::uuid),
    ('b9c91fc9-787e-5bca-9413-d21ad529150b'::uuid, 'dd4f6dc6-138e-4d9d-a343-c72f1ee462ac'::uuid),
    ('573b7042-4fb8-54ee-825e-4e050d54bb9f'::uuid, '8bf58665-4f5a-4440-9091-8f860456afcb'::uuid),
    ('12bb662e-5e39-578f-861f-3f1c06ba34de'::uuid, '3e463777-d6d5-447a-bc21-b6836cbffc31'::uuid),
    ('4e3cb243-46f9-58f3-8d11-b2db44a8106a'::uuid, '95bdcfef-a597-41af-b55f-54070cfa1c98'::uuid),
    ('66173f0a-e7e3-5ba5-8870-a63617b27cbe'::uuid, 'ed15f22f-eb1e-4332-9268-04e5388ee74f'::uuid),
    ('7fbd17e7-7977-51c1-b51d-7e3a6b25c6ba'::uuid, 'aa138837-5986-42c1-b2bb-337f6d48c82f'::uuid),
    ('50b87c03-8ecd-50a8-9148-d4b6c9da55a2'::uuid, '9541ce72-4752-42a0-bc75-1f24cdb87103'::uuid),
    ('0497691d-b89e-5891-a7ca-39f823ca2a6f'::uuid, 'c1dc49bd-d4bd-4d41-8380-981ba218eac0'::uuid),
    ('38a7e911-d545-46f5-87fe-0a4f97ed6b90'::uuid, '16305388-7df0-57e5-af0a-8b5a09fb1577'::uuid),
    ('1762e8fd-9ab9-5bf8-b211-0695b788c66e'::uuid, '64aea644-c819-4101-b48d-07b70721988e'::uuid),
    ('7cd2f2b4-66b0-521c-9601-9c2ff1a7ca9b'::uuid, 'ba7b1dd6-107e-4d34-8793-df9502cdb03e'::uuid),
    ('3581f2cd-c7bc-59d9-ac70-466171e55aca'::uuid, 'f1380140-ecf3-4c9d-9628-d12b780ab1e7'::uuid),
    ('2d7e682f-649c-5fd1-adc6-0f098157e8b0'::uuid, '38df74e4-2f59-49d8-9a08-b0ce44b07f2d'::uuid),
    ('24b7927b-ecc1-5b0c-b4c0-84f738d12fc3'::uuid, 'c09c700a-bb75-49be-afdb-4b68b319216c'::uuid),
    ('70bfee99-7f16-52d5-b79f-afa560c7847c'::uuid, '98777d35-7b00-44a7-9a07-2e7ba926298f'::uuid),
    ('aa51a98d-8af5-50e9-b024-cf7c467bdf6c'::uuid, 'ff3e1203-35d6-46b7-a07f-8788f2c4f8cc'::uuid),
    ('933cac58-a771-58a3-96ae-75da49bd4d3e'::uuid, 'ce95c85b-cedb-403b-ac3e-dfa1dbb325ae'::uuid),
    ('a42ca017-9fa6-55ff-9648-bd7bb5b6ec03'::uuid, 'b2034e63-7e5c-47fd-9ccd-02c7d7cdb553'::uuid),
    ('413cb607-52b2-517b-840d-ab9ac2c2e58a'::uuid, '4c790b8c-124f-4e8b-bcea-6e65b592075f'::uuid),
    ('3fedf51f-ec6c-536d-b5c5-066291979fc8'::uuid, '9b7c0eb7-c2f0-4121-b338-6cf6173f85ed'::uuid),
    ('9084a486-f562-5808-a73b-68958c070685'::uuid, 'a9b34138-42d0-4255-8aba-e07f5f9d9ac3'::uuid),
    ('bc0f5e59-a657-56d5-93d8-e4b00f619cd4'::uuid, 'e37d7443-b5ba-400a-bac9-7b4a54f8315f'::uuid),
    ('2ef7c3c3-e36e-5c37-bc1a-b1be1c822b42'::uuid, '357885de-ce9e-4534-825d-6e7d283a1181'::uuid),
    ('1162af71-0b82-5bf8-9978-001bd65d2d2d'::uuid, 'dda28496-e865-44fa-99ca-1a14c79a986b'::uuid),
    ('aac7ffc3-76b6-58c6-886a-8240ce532426'::uuid, 'd7879f45-cece-4870-8486-ec5b00ec9ce6'::uuid),
    ('1f3a5849-3cd6-5e78-bb92-99829e749c8f'::uuid, 'aff318de-d9a2-4716-a0e5-e32fa509d4a6'::uuid),
    ('ae8f8da4-c470-5b3c-b852-df9bd3d28500'::uuid, 'f22c1243-c09c-48b5-a1bb-7f3c06705364'::uuid),
    ('4bd0be8a-f885-5d84-9268-8d2884393fe9'::uuid, 'bdd78290-7a9c-4f76-8b6c-5f5cd767b4ce'::uuid),
    ('05f081e1-15bf-5105-b5d2-dc9306d8615d'::uuid, '73c12622-0d13-4a6f-a139-7a955e9490ea'::uuid),
    ('047fe415-da64-506f-9597-e8b00c232425'::uuid, '0b5323a9-1ad1-4dd5-8556-fc06db59fc1c'::uuid),
    ('17f54d61-8433-5f7a-b0ac-d8cb1a905008'::uuid, '35d9b4a7-c247-47ad-8115-b0050e15b1de'::uuid),
    ('42a2ea17-0e13-5142-a8c5-84dec231f9f2'::uuid, '607ef508-2474-40dc-ab8f-0b3a3459472b'::uuid),
    ('70324ad2-3590-5d45-89c3-670809a7a67a'::uuid, '7ae64a89-f6e5-41eb-acac-870945de7c77'::uuid),
    ('44320186-506e-55f9-8f2a-bfc5036960b0'::uuid, '7f64cb40-3013-44a0-88f0-442f1187c3b6'::uuid),
    ('7a66a6f8-b5f5-50bf-921a-b6e5b9406b13'::uuid, '8aa8d331-e4f5-4a69-bb49-240b06171bab'::uuid),
    ('13e270fa-6b51-5122-827d-45ff5622d92d'::uuid, 'a752cd89-fcbc-40ec-9a0c-30415bc3ea7b'::uuid),
    ('0d562203-3e23-5e58-86a3-397a1ec4169d'::uuid, 'a7e2d6d1-38fe-430f-94dc-a9e3ab04509e'::uuid),
    ('ac7a42bc-a6fc-44b3-9321-625f5c2d1774'::uuid, '12f6281f-0635-5551-9caa-3bfbaabaf3a2'::uuid),
    ('a0c27793-566d-5ee3-b482-e513a5619c2b'::uuid, 'b3f67e79-75d3-4909-9da4-ecd90be142f0'::uuid),
    ('54639c64-0171-5ace-9fc0-952448b904a3'::uuid, 'b45d8cb8-c764-41f6-8810-6d45961ac4c5'::uuid),
    ('af7e4264-ad6f-5cf2-9607-aa5cc516f18d'::uuid, 'bcba302d-ed03-4853-bf2f-910e50657ead'::uuid),
    ('13aab5d1-f12b-5c89-b430-9e98935b2993'::uuid, 'd159ec05-1fbf-471c-b832-6ecb680a5b73'::uuid),
    ('188d815d-838c-551a-b43b-80e2eaca2491'::uuid, 'd3a0251f-9463-444e-a73e-0a788209c97e'::uuid),
    ('1a54ae3a-2dce-5924-aed9-5b1590561e5e'::uuid, 'd918838f-2e82-4654-9352-79d749e78f95'::uuid),
    ('5c762c3e-6f03-5712-b6ec-1fb7af8bd369'::uuid, 'dd8e91cc-763a-4166-b72b-162a728cba74'::uuid),
    ('a92f85dc-219b-5643-8fc4-598abdf72e2b'::uuid, 'e07a5188-b0e4-414a-b3da-13fe7ce3e368'::uuid),
    ('51ee4672-d9df-5ef1-aaef-c1ae4ed5a5cc'::uuid, 'e9f53d9f-89a1-4e1c-9bf5-8e0c356ad3e7'::uuid),
    ('674ebbc6-46f5-5a8c-9486-46a0c5a92ce1'::uuid, 'fb63d6e7-9fa3-426e-9367-7a671bcaa2d8'::uuid),
    ('b51244df-ff15-5ad2-852f-78024457d846'::uuid, 'fdee9edb-9177-4554-8221-1f4af9f2ccd7'::uuid)
    ) as t(dup_id, canonical_id)
  loop
    -- 두 id 모두 아직 stores에 존재할 때만 병합 (혹시 이미 처리됐거나 대상이 사라졌으면 스킵)
    if exists (select 1 from public.stores where id = v_pair.dup_id)
       and exists (select 1 from public.stores where id = v_pair.canonical_id) then
      perform public.merge_duplicate_store(v_pair.dup_id, v_pair.canonical_id);
    end if;
  end loop;
end $$;

select public.refresh_store_ranking_stats();

-- recommend_score 근본 버그 수정: 기존 공식은 "거리 페널티(km당 15점)"가 "당첨 이력 점수"를
-- 압도해서(옛날 1등 1회 = 5점 vs 0.34km 거리차 = 5점 페널티), 당첨 이력이 전혀 없는 매장이
-- 그냥 가깝다는 이유만으로 "추천순위 1위"로 뜨는 버그였다("1등을 한 적이 없는데 추천 1위에
-- 표시", "상세페이지 들어가면 전국/시도/시군구 순위가 전부 -위"로 재현됨).
-- "명당 추천" 기능의 본질은 당첨 이력이지 근접성이 아니므로, 당첨 이력이 있는 매장군과 없는
-- 매장군을 먼저 분리(1000점 고정 보너스)하고, 그 안에서만 거리로 미세 조정하도록 고친다.
-- (기본 검색 반경 3km 기준 최대 거리 페널티는 45점이라 1000점 보너스를 절대 못 뒤집는다.)
create or replace function public.nearby_stores(
  in_lat       double precision,
  in_lng       double precision,
  radius_m     integer default 3000,
  max_results  integer default 50
)
returns table (
  store_id            uuid,
  name                text,
  address             text,
  latitude            double precision,
  longitude           double precision,
  distance_m          double precision,
  first_prize_count   integer,
  second_prize_count  integer,
  store_score         numeric,
  recommend_score     numeric,
  nation_rank         integer,
  province_rank       integer,
  city_rank           integer
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.address,
    s.latitude,
    s.longitude,
    extensions.st_distance(s.location, extensions.st_setsrid(extensions.st_makepoint(in_lng, in_lat), 4326)::extensions.geography) as distance_m,
    coalesce(r.first_prize_count, 0)  as first_prize_count,
    coalesce(r.second_prize_count, 0) as second_prize_count,
    coalesce(r.store_score, 0)        as store_score,
    (case when coalesce(r.first_prize_count, 0) + coalesce(r.second_prize_count, 0) > 0
          then 1000 + coalesce(r.store_score, 0)
          else 0 end)
      - (extensions.st_distance(s.location, extensions.st_setsrid(extensions.st_makepoint(in_lng, in_lat), 4326)::extensions.geography) / 1000.0) * 15
                                       as recommend_score,
    r.nation_rank,
    r.province_rank,
    r.city_rank
  from public.stores s
  left join public.store_ranking_stats r on r.id = s.id
  where s.is_active
    and extensions.st_dwithin(s.location, extensions.st_setsrid(extensions.st_makepoint(in_lng, in_lat), 4326)::extensions.geography, radius_m)
  order by recommend_score desc
  limit max_results;
$$;

comment on function public.nearby_stores is
  '반경(m) 내 판매점을 스마트 추천 점수(recommend_score) 순으로 반환. 당첨 이력이 있는 매장을 항상 우선하고(1000점 고정 보너스), 그 안에서만 거리로 미세 조정한다.';
