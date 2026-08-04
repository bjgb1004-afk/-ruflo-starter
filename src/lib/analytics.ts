import PostHog from "posthog-react-native";
import Constants from "expo-constants";

let client: PostHog | null = null;

export function initAnalytics() {
  const apiKey = Constants.expoConfig?.extra?.posthogApiKey;
  if (!apiKey) return; // 무료 티어: API 키 미설정 시 조용히 비활성화

  client = new PostHog(apiKey, { host: "https://app.posthog.com" });
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  client?.capture(name, properties);
}
