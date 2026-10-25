-- versionCode 2(런타임 표식 '1.0.0')에 갇힌 유저를 스토어로 보낸다.
--
-- 이 사람들은 2026-10-13 네이티브 전환 이후 어떤 OTA도 받지 못했고(약 10%), 그 껍데기에는
-- 인앱 업데이트 안내 기능조차 없다 - 그 기능이 새 빌드에 처음 들어갔기 때문이다.
-- 2026-10-25에 같은 JS 번들을 런타임 '1.0.0'으로도 발행해(update group ff2554db) 이들에게
-- 게이트 코드를 전달했으므로, 이 줄이 그 코드에 걸려 전체화면 안내로 뜬다.
--
-- 이 줄을 지우면 안내도 사라진다. versionCode 1도 표식이 '1.0.0'이라 같이 대상이 된다.
insert into public.app_update_gates (runtime_version, title, message) values
  (
    '1.0.0',
    '업데이트가 필요합니다',
    '지금 설치된 버전은 더 이상 새 기능과 데이터를 받지 못합니다. 스토어에서 최신 버전을 받아주세요.'
  )
on conflict (runtime_version) do update
  set title = excluded.title,
      message = excluded.message;
