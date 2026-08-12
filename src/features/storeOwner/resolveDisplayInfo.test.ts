import { resolvePhone, resolveOwnerMessage, daysUntilExpiry } from "./resolveDisplayInfo";

describe("resolvePhone", () => {
  it("사장님이 입력한 전화번호가 있으면 우선 사용", () => {
    expect(resolvePhone("010-1111-2222", "02-333-4444")).toBe("010-1111-2222");
  });
  it("사장님 입력이 없으면(null) 공공데이터 값으로 폴백", () => {
    expect(resolvePhone(null, "02-333-4444")).toBe("02-333-4444");
  });
  it("사장님 입력이 빈 문자열이면 폴백", () => {
    expect(resolvePhone("  ", "02-333-4444")).toBe("02-333-4444");
  });
  it("둘 다 없으면 undefined", () => {
    expect(resolvePhone(null, null)).toBeUndefined();
  });
});

describe("resolveOwnerMessage", () => {
  it("공백만 있으면 null", () => {
    expect(resolveOwnerMessage("   ")).toBeNull();
  });
  it("내용이 있으면 그대로 반환", () => {
    expect(resolveOwnerMessage("항상 친절하게 모시겠습니다")).toBe("항상 친절하게 모시겠습니다");
  });
});

describe("daysUntilExpiry", () => {
  it("정확히 7일 남았으면 7", () => {
    const now = new Date("2026-08-12T00:00:00Z");
    const expiresAt = new Date("2026-08-19T00:00:00Z").toISOString();
    expect(daysUntilExpiry(expiresAt, now)).toBe(7);
  });
  it("이미 지났으면 0(음수 금지)", () => {
    const now = new Date("2026-08-20T00:00:00Z");
    const expiresAt = new Date("2026-08-19T00:00:00Z").toISOString();
    expect(daysUntilExpiry(expiresAt, now)).toBe(0);
  });
});
