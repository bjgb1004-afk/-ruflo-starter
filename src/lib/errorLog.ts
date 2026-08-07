import * as Sentry from "@sentry/react-native";
import { supabase } from "./supabase";

// 실패를 Sentry(상세 스택트레이스)와 app_error_logs(관리자 페이지에서 바로 조회) 양쪽에
// 동시에 남긴다. DB 기록은 실패해도(오프라인 등) 무시 - 에러 로깅 자체가 또 다른 에러를
// 만들면 안 된다.
export function reportError(error: unknown, feature: string) {
  Sentry.captureException(error, { tags: { feature } });

  const message = error instanceof Error ? error.message : String(error);
  (supabase.from("app_error_logs") as any)
    .insert({ feature, message })
    .then(() => {})
    .catch(() => {});
}
