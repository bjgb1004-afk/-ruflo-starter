-- 오류 기록에 "어느 앱에서 났는지"를 붙인다.
--
-- 왜 필요한가: 지금까지 남는 건 기능 이름·메시지·시각뿐이었다. 그래서 2026-11-01에
-- 알림 예약 실패 52건을 고치고도 "고친 번들을 쓰는 사람에게서도 계속 나는가"를 물어볼
-- 수가 없었다. 건수가 줄어든 게 수정 효과인지 그냥 사람들이 앱을 덜 열어서인지 구분이
-- 안 된다.
--
-- update_id가 핵심이다. OTA 묶음마다 다른 값이라 "수정 전 번들 / 수정 후 번들"을 갈라
-- 셀 수 있다. runtime_version은 껍데기(빌드)를 가리키므로, OTA를 못 받는 구버전에서
-- 나는 오류를 따로 셀 수 있다.
--
-- session_id는 앱을 켤 때마다 새로 만드는 임시 번호다. 기기에 저장하지 않으므로
-- 사람을 추적하지 않고(= Play 데이터 보안 선언을 고칠 필요가 없고), "한 번의 실행에서
-- 25번 터진 것"과 "25번의 실행에서 한 번씩 터진 것"은 구분할 수 있다.
-- 다만 "몇 명"은 여전히 알 수 없다 - 그걸 알려면 기기에 남는 고정 식별자가 필요하고,
-- 그때는 데이터 보안 항목과 개인정보처리방침을 같이 고쳐야 한다.
--
-- 전부 nullable이다. 구버전 앱은 이 칸들을 안 보내고, 그 기록도 그대로 들어와야 한다.

alter table public.app_error_logs
  add column if not exists app_version text,
  add column if not exists runtime_version text,
  add column if not exists update_id text,
  add column if not exists session_id text;

comment on column public.app_error_logs.app_version is
  '번들 매니페스트의 앱 버전(예: 1.0.0). 사람이 읽기 쉬운 값.';
comment on column public.app_error_logs.runtime_version is
  '설치된 껍데기의 런타임 표식. 이 값이 다른 기기는 서로 다른 빌드이며 OTA를 공유하지 않는다.';
comment on column public.app_error_logs.update_id is
  '지금 돌고 있는 OTA 묶음의 id. "수정 전/후 번들"을 갈라 세는 데 쓴다. 껍데기 번들로 돌면 null.';
comment on column public.app_error_logs.session_id is
  '앱을 켤 때마다 새로 만드는 임시 번호. 기기에 저장하지 않아 사람을 추적하지 않는다.
   같은 실행에서 반복된 오류를 한 덩어리로 묶어 보기 위한 것.';
