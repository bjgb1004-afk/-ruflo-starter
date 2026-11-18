-- versionCode 3(런타임 표식 'ba19255c...')에 갇힌 유저를 스토어로 보낸다.
--
-- 2026-11-18 versionCode 4(별점 팝업, 새 runtimeVersion "5")가 프로덕션에 100% 게시됨에
-- 따라, 그 전 빌드의 런타임은 이제 OTA를 못 받는 구버전이 됐다. 패턴은
-- 20261025010000_gate_versioncode2_runtime.sql과 동일.
insert into public.app_update_gates (runtime_version, title, message) values
  (
    'ba19255c8691a039326d48adafb9e3f46e6de005',
    '업데이트가 필요합니다',
    '새 기능을 쓰려면 스토어에서 최신 버전을 받아주세요.'
  )
on conflict (runtime_version) do update
  set title = excluded.title,
      message = excluded.message;
