import { isDroppedRequest } from "./isDroppedRequest";

/** Node의 fetch가 연결 실패를 알리는 모양을 그대로 만든다. */
function fetchFailed(code: string): Error {
  const err = new Error("fetch failed");
  (err as { cause?: unknown }).cause = Object.assign(new Error("Connect Timeout Error"), { code });
  return err;
}

describe("다시 때릴 실패인지 가리기", () => {
  // 2026-10-23에 실제로 본 모양. 이걸 영구 실패로 보면 수집이 빈손으로 끝난다.
  it("동행복권이 응답을 떨군 연결 타임아웃은 다시 때린다", () => {
    expect(isDroppedRequest(fetchFailed("UND_ERR_CONNECT_TIMEOUT"))).toBe(true);
  });

  it("cause가 없어도 메시지가 fetch failed면 다시 때린다", () => {
    expect(isDroppedRequest(new Error("fetch failed"))).toBe(true);
  });

  it("받다가 끊긴 것도 다시 때린다", () => {
    expect(isDroppedRequest(new Error("terminated"))).toBe(true);
  });

  it("연결 계열 코드들은 다시 때린다", () => {
    for (const code of ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"]) {
      expect(isDroppedRequest(fetchFailed(code))).toBe(true);
    }
  });

  // 반대쪽이 더 중요하다. 같은 답이 올 실패를 재시도하면 차단 위험만 키운다.
  it("응답 형식이 바뀐 것은 다시 때리지 않는다", () => {
    const err = new Error("발행내역 목록이 비었다 (resultCode=fail.common.msg, message=?)");
    expect(isDroppedRequest(err)).toBe(false);
  });

  it("HTTP 오류 응답은 다시 때리지 않는다", () => {
    expect(isDroppedRequest(new Error("발행내역 조회 실패: HTTP 403"))).toBe(false);
    expect(isDroppedRequest(new Error("발행내역 조회 실패: HTTP 500"))).toBe(false);
  });

  it("에러가 아닌 것은 다시 때리지 않는다", () => {
    for (const notError of [null, undefined, "fetch failed", 500, {}]) {
      expect(isDroppedRequest(notError)).toBe(false);
    }
  });
});
