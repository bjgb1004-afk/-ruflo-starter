import { validateFeedback, FEEDBACK_MIN, FEEDBACK_MAX, CONTACT_MAX } from "./feedbackApi";

jest.mock("@/lib/supabase", () => ({ supabase: { from: jest.fn() } }));
jest.mock("@/lib/errorLog", () => ({ reportError: jest.fn() }));
jest.mock("expo-constants", () => ({ expoConfig: { version: "1.0.0" } }));

describe("validateFeedback", () => {
  it("너무 짧은 내용은 거절한다", () => {
    expect(validateFeedback("a".repeat(FEEDBACK_MIN - 1), "")).not.toBeNull();
    expect(validateFeedback("   짧음   ", "")).not.toBeNull(); // 공백 제외 길이로 본다
  });

  it("최소 길이 이상이면 통과한다", () => {
    expect(validateFeedback("a".repeat(FEEDBACK_MIN), "")).toBeNull();
  });

  it("너무 긴 내용은 거절한다", () => {
    expect(validateFeedback("a".repeat(FEEDBACK_MAX + 1), "")).not.toBeNull();
    expect(validateFeedback("a".repeat(FEEDBACK_MAX), "")).toBeNull();
  });

  it("연락처는 선택이고, 너무 길면 거절한다", () => {
    expect(validateFeedback("지도가 느려요", "")).toBeNull();
    expect(validateFeedback("지도가 느려요", "b".repeat(CONTACT_MAX + 1))).not.toBeNull();
    expect(validateFeedback("지도가 느려요", "b".repeat(CONTACT_MAX))).toBeNull();
  });
});
