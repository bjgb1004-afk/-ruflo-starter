import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

export function initSentry() {
  const dsn = Constants.expoConfig?.extra?.sentryDsn;
  if (!dsn) return; // 무료 티어: DSN 미설정 시 조용히 비활성화

  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
  });
}
