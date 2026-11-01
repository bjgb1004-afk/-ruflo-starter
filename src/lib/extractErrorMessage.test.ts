import { extractMessage } from "./extractErrorMessage";

describe("extractMessage", () => {
  it("Error의 메시지를 그대로 쓴다", () => {
    expect(extractMessage(new Error("타임아웃"))).toBe("타임아웃");
  });

  it("메시지가 빈 Error는 종류라도 남긴다", () => {
    // 2026-09~10에 메시지가 빈 기록이 46건 쌓였다. "" 한 줄은 아무것도 알려주지 않는다.
    expect(extractMessage(new Error(""))).toBe("Error");
    expect(extractMessage(new TypeError(""))).toBe("TypeError");
  });

  it("Error가 아닌 객체도 message 프로퍼티를 찾는다", () => {
    // Supabase의 PostgrestError 등은 Error 인스턴스가 아니다.
    expect(extractMessage({ message: "JWT expired", code: "PGRST301" })).toBe("JWT expired");
  });

  it("message가 비어 있으면 객체 전체를 직렬화해 단서를 남긴다", () => {
    const out = extractMessage({ message: "   ", code: "PGRST301" });
    expect(out).toContain("PGRST301");
  });

  it("message가 없는 객체는 직렬화한다 - [object Object]로 뭉개지 않는다", () => {
    const out = extractMessage({ status: 500, hint: null });
    expect(out).not.toBe("[object Object]");
    expect(out).toContain("500");
  });

  it("순환 참조로 직렬화가 실패하면 최후의 수단으로 문자열화한다", () => {
    const circular: Record<string, unknown> = { status: 500 };
    circular.self = circular;
    expect(() => extractMessage(circular)).not.toThrow();
  });

  it("문자열이나 숫자를 던진 경우도 남긴다", () => {
    expect(extractMessage("그냥 문자열")).toBe("그냥 문자열");
    expect(extractMessage(42)).toBe("42");
  });
});
