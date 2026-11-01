// 던져진 값에서 사람이 읽을 메시지를 뽑는다.
//
// 떼어낸 이유: errorLog.ts는 Sentry와 supabase를 끌어오므로 그 안에 두면 테스트가
// 무겁다(winNotificationText.ts를 떼어 둔 것과 같은 이유).

// Supabase(PostgrestError 등)나 그 외 커스텀 throw는 Error 인스턴스가 아니라 message
// 프로퍼티만 있는 plain object인 경우가 많다. String(error)로 뭉개면 "[object Object]"만
// 남아 실제 원인을 알 수 없게 되므로, message 프로퍼티를 먼저 찾고 없으면 전체를 직렬화한다.
export function extractMessage(error: unknown): string {
  // Error라도 message가 비어 있을 수 있다(new Error() / 네이티브 쪽에서 올라온 빈 거부).
  // 그때는 적어도 종류(name)라도 남긴다 - "" 한 줄은 아무것도 알려주지 않는다.
  if (error instanceof Error) {
    if (error.message.trim().length > 0) return error.message;
    return error.name || "Error (메시지 없음)";
  }
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    // 빈 문자열은 "메시지가 있다"로 치면 안 된다 - 그대로 저장하면 원인을 알 수 없는
    // 기록이 남는다(2026-09~10에 46건이 그렇게 쌓였다). 전체를 직렬화해 단서라도 남긴다.
    if (typeof message === "string" && message.trim().length > 0) return message;
    try {
      return JSON.stringify(error);
    } catch {
      // 순환 참조 등으로 직렬화 자체가 실패하면 최후의 수단
    }
  }
  return String(error);
}
