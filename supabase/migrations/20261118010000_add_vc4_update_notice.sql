-- versionCode 4 업데이트 소식. 앱 안 업데이트 팝업(app_notices)에 뜬다.
insert into public.app_notices (title, message) values
  (
    '업데이트 소식',
    '복권 용지 QR 코드가 일부 기기에서 안 읽히던 문제를 고쳤어요. 같은 번호로 알림이 두 번 가던 문제도 고쳤고, 저장한 번호의 알림을 끌 수 있는 설정을 추가했어요. "놓친 당첨금" 화면에서 최근 회차 금액이 안 뜨던 문제도 수정했어요.'
  );
