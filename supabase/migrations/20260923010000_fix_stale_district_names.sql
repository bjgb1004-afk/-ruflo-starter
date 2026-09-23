-- 동행복권 원본 주소에 폐지·개칭 전 지명이 남아 있어, 같은 지역이 랭킹 화면의
-- "시/군/구 선택"에 유령 항목으로 따로 잡히던 것들을 현재 행정구역으로 맞춘다.
-- 앞으로 적재되는 행은 addressNormalizer.ts의 DISTRICT_RENAMES가 같은 규칙으로 막는다.

-- 인천 남구 → 미추홀구 (2018년 개칭)
update public.stores
set address = replace(address, '인천광역시 남구', '인천광역시 미추홀구'),
    sigungu = '미추홀구'
where sido = '인천광역시' and sigungu = '남구';

-- 검단구/서해구 → 서구 (검단은 서구 관할, 서해구는 존재하지 않는 표기)
update public.stores
set address = replace(replace(address, '인천광역시 검단구', '인천광역시 서구'),
                      '인천광역시 서해구', '인천광역시 서구'),
    sigungu = '서구'
where sido = '인천광역시' and sigungu in ('검단구', '서해구');

-- 마산시/진해시 → 창원시 (2010년 통합)
update public.stores
set address = replace(replace(address, '경상남도 마산시', '경상남도 창원시'),
                      '경상남도 진해시', '경상남도 창원시'),
    sigungu = '창원시'
where sido = '경상남도' and sigungu in ('마산시', '진해시');

-- 군위군: 경북 → 대구 편입 (2023년)
update public.stores
set address = replace(address, '경상북도 군위군', '대구광역시 군위군'),
    sido = '대구광역시'
where sido = '경상북도' and sigungu = '군위군';

-- 세종특별자치시는 산하에 시/군/구가 없는데 주소 두 번째 토큰(도로명)이 그대로
-- sigungu로 저장돼, 시/군/구 드롭다운에 도로명 24종이 떠 있었다.
update public.stores
set sigungu = null
where sido = '세종특별자치시' and sigungu !~ '[시군구]$';

-- 바뀐 sido/sigungu로 시도별·시군구별 순위를 다시 계산한다.
select public.refresh_store_ranking_stats();
