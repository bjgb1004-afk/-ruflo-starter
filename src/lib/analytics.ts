// FCM과 같은 google-services.json을 쓴다 - 별도 설정값이 없어 조용히 꺼질 일이 없다
// (DSN/앱 ID가 없으면 꺼지는 Sentry·AdMob과 다른 점).
//
// Firebase 네이티브 모듈을 최상위 import가 아니라 호출 시점 require로 가져온다.
// 이 모듈은 2026-10-13에 들어갔으므로 그 이전 껍데기(versionCode 2 이하)에는 없다 -
// 최상위에서 불러오면 그 폰에서 번들 로드 자체가 실패해 앱이 즉사한다. 구버전 껍데기에
// 갇힌 유저에게 "스토어에서 업데이트" 안내를 보내려면 같은 번들이 양쪽에서 다 떠야 한다
// (src/features/appUpdate/ 참고). 부품이 없으면 집계만 조용히 건너뛴다.
type FirebaseAnalytics = typeof import("@react-native-firebase/analytics");

function loadAnalytics(): FirebaseAnalytics | null {
  try {
    return require("@react-native-firebase/analytics") as FirebaseAnalytics;
  } catch {
    return null;
  }
}

export function logScreenView(screenName: string) {
  const fb = loadAnalytics();
  if (!fb) return;
  fb.logScreenView(fb.getAnalytics(), {
    screen_name: screenName,
    screen_class: screenName,
  }).catch(() => {});
}

export function logAppOpen() {
  const fb = loadAnalytics();
  if (!fb) return;
  fb.logAppOpen(fb.getAnalytics()).catch(() => {});
}
