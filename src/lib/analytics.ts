import { getAnalytics, logScreenView as fbLogScreenView, logAppOpen as fbLogAppOpen } from "@react-native-firebase/analytics";

// FCM과 같은 google-services.json을 쓴다 - 별도 설정값이 없어 조용히 꺼질 일이 없다
// (DSN/앱 ID가 없으면 꺼지는 Sentry·AdMob과 다른 점).
export function logScreenView(screenName: string) {
  fbLogScreenView(getAnalytics(), { screen_name: screenName, screen_class: screenName }).catch(() => {});
}

export function logAppOpen() {
  fbLogAppOpen(getAnalytics()).catch(() => {});
}
