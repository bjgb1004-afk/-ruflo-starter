// 동행복권 호출이 "다시 때리면 될 실패"인지 "다시 때려도 같은 실패"인지 가른다.
//
// 떼어 둔 이유: 이 판단을 틀리면 양쪽 다 비싸다. 떨굼을 영구 실패로 보면 오늘(2026-10-23)
// 처럼 수집이 빈손으로 끝나고, 반대로 응답 형식이 바뀐 것까지 재시도하면 같은 답을 받으려고
// 6번을 더 때려 차단 위험만 키운다(project_dhlottery_rate_limit).
//
// 떨굼의 모양: 동행복권은 거부 응답을 주는 게 아니라 아무 대답을 안 해서 연결 단계에서
// 타임아웃이 난다. Node의 fetch는 그걸 메시지 "fetch failed"로만 알리고 실제 코드
// (UND_ERR_CONNECT_TIMEOUT 등)는 cause에 넣는다.

/** 다시 때릴 가치가 있는 실패인가. 연결 단계 실패만 true. */
export function isDroppedRequest(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // 연결이 아예 안 된 경우. 메시지는 구현이 바꿀 수 있으니 cause의 코드도 같이 본다.
  if (err.message === "fetch failed") return true;
  // 연결은 됐는데 응답을 받다 끊긴 경우.
  if (err.message.includes("terminated")) return true;
  // 타임아웃(AbortSignal.timeout)도 같은 성격이다.
  if (err.name === "TimeoutError") return true;

  const code = (err as { cause?: { code?: unknown } }).cause?.code;
  return (
    typeof code === "string" &&
    ["UND_ERR_CONNECT_TIMEOUT", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"].includes(
      code,
    )
  );
}
