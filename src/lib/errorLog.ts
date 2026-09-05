import * as Sentry from "@sentry/react-native";
import { supabase } from "./supabase";

// 실패를 Sentry(상세 스택트레이스)와 app_error_logs(관리자 페이지에서 바로 조회) 양쪽에
// 동시에 남긴다. DB 기록은 실패해도(오프라인 등) 무시 - 에러 로깅 자체가 또 다른 에러를
// 만들면 안 된다.
// Supabase(PostgrestError 등)나 그 외 커스텀 throw는 Error 인스턴스가 아니라 message
// 프로퍼티만 있는 plain object인 경우가 많다. String(error)로 뭉개면 "[object Object]"만
// 남아 실제 원인을 알 수 없게 되므로, message 프로퍼티를 먼저 찾고 없으면 전체를 직렬화한다.
function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
    try {
      return JSON.stringify(error);
    } catch {
      // 순환 참조 등으로 직렬화 자체가 실패하면 최후의 수단
    }
  }
  return String(error);
}

export function reportError(error: unknown, feature: string) {
  Sentry.captureException(error, { tags: { feature } });

  const message = extractMessage(error);
  (supabase.from("app_error_logs") as any)
    .insert({ feature, message })
    .then(() => {})
    .catch(() => {});
}
