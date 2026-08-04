-- 로컬 개발/테스트용 샘플 데이터
-- 실제 배치(scripts/ingest/lib/storeId.ts)는 UUID v5로 id를 결정론적으로 생성하지만,
-- 시드 데이터는 고정된 예시 UUID를 직접 지정한다.
insert into public.stores (
  id, external_id, name, store_type, address, road_address,
  sido, sigungu, phone, dong_code, building_main, building_sub, latitude, longitude
)
values
  ('11111111-1111-5111-8111-111111111111', 'SAMPLE-0001', '행운복권방', '일반',
   '서울특별시 강남구 테헤란로 123', '테헤란로 123', '서울특별시', '강남구', '02-000-0001',
   '1168010100', 123, 0, 37.5006, 127.0364),
  ('22222222-2222-5222-8222-222222222222', 'SAMPLE-0002', '대박로또', '인터넷겸업',
   '부산광역시 해운대구 센텀중앙로 45', '센텀중앙로 45', '부산광역시', '해운대구', '051-000-0002',
   '2635010600', 45, 0, 35.1691, 129.1306)
on conflict (id) do nothing;

insert into public.draw_history (
  draw_no, draw_date, winning_numbers, bonus_number,
  first_prize_total_amount, first_prize_winner_count, first_prize_amount_per_win, total_sales_amount,
  first_prize_store_ids
)
values (
  1121, '2024-06-01', array[3,7,15,22,31,42], 9,
  20000000000, 12, 1666000000, 100000000000,
  array['11111111-1111-5111-8111-111111111111'::uuid]
)
on conflict (draw_no) do nothing;

-- store_ranking_stats는 배치 재계산 함수로 채운다 (View가 아닌 물리 테이블이므로 seed 이후 직접 호출 필요).
select public.refresh_store_ranking_stats();
