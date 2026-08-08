import PostHog from "posthog-react-native";
import Constants from "expo-constants";

let client: PostHog | null = null;

export function initAnalytics() {
  const apiKey = Constants.expoConfig?.extra?.posthogApiKey;
  if (!apiKey) return; // 무료 티어: API 키 미설정 시 조용히 비활성화

  client = new PostHog(apiKey, { host: "https://app.posthog.com" });
  // 회원가입 없는 익명 사용자도 PostHog가 기기별로 자동 배정하는 distinct_id로 집계되지만,
  // 이벤트를 하나도 보내지 않으면 세션 자체가 잡히지 않을 수 있어 앱 실행마다 최소 1건은
  // 명시적으로 남긴다 - 관리자 페이지에서 "사용자 수"를 PostHog 대시보드로 확인하는 근거가 된다.
  client.capture("app_opened");
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  client?.capture(name, properties as any);
}
