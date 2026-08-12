import {
  evaluateLockout,
  isNameSimilar,
  classifyVerification,
  LOCKOUT_ATTEMPT_COUNT,
} from "./verifyStoreOwnerLogic";

describe("evaluateLockout", () => {
  it("잠금 없음: 시도 5건 미만이면 잠기지 않는다", () => {
    const attempts = Array.from({ length: LOCKOUT_ATTEMPT_COUNT - 1 }, (_, i) => ({
      result: "rejected" as const,
      created_at: new Date(Date.now() - i * 1000).toISOString(),
    }));
    expect(evaluateLockout(attempts).locked).toBe(false);
  });

  it("잠금: 최근 5건이 모두 rejected이고 마지막 실패가 24시간 이내면 잠긴다", () => {
    const now = new Date("2026-08-12T10:00:00Z");
    const attempts = Array.from({ length: LOCKOUT_ATTEMPT_COUNT }, (_, i) => ({
      result: "rejected" as const,
      created_at: new Date(now.getTime() - i * 60_000).toISOString(),
    }));
    const result = evaluateLockout(attempts, now);
    expect(result.locked).toBe(true);
    expect(result.unlockAt).toBe(new Date(now.getTime() - 0 + 24 * 60 * 60 * 1000).toISOString());
  });

  it("잠금 해제: 마지막 실패로부터 24시간이 지나면 잠기지 않는다", () => {
    const now = new Date("2026-08-13T11:00:00Z"); // 25시간 후
    const attempts = Array.from({ length: LOCKOUT_ATTEMPT_COUNT }, (_, i) => ({
      result: "rejected" as const,
      created_at: new Date("2026-08-12T10:00:00Z").getTime() - i * 60_000,
    })).map((a) => ({ result: a.result, created_at: new Date(a.created_at).toISOString() }));
    expect(evaluateLockout(attempts, now).locked).toBe(false);
  });

  it("잠금 없음: 최근 5건 중 하나라도 approved면 잠기지 않는다", () => {
    const attempts = [
      { result: "rejected" as const, created_at: new Date().toISOString() },
      { result: "approved" as const, created_at: new Date().toISOString() },
      { result: "rejected" as const, created_at: new Date().toISOString() },
      { result: "rejected" as const, created_at: new Date().toISOString() },
      { result: "rejected" as const, created_at: new Date().toISOString() },
    ];
    expect(evaluateLockout(attempts).locked).toBe(false);
  });
});

describe("isNameSimilar", () => {
  it("임계값 이상이면 true", () => {
    expect(isNameSimilar(0.3)).toBe(true);
    expect(isNameSimilar(0.29)).toBe(false);
  });
});

describe("classifyVerification", () => {
  it("국세청 진위확인 실패 시 hometax_mismatch로 거절", () => {
    expect(
      classifyVerification({ hometaxValid: false, businessStatus: "01", nameSimilarityScore: 1 }),
    ).toEqual({ approved: false, reason: "hometax_mismatch" });
  });

  it("휴업/폐업 상태면 business_closed로 거절", () => {
    expect(
      classifyVerification({ hometaxValid: true, businessStatus: "03", nameSimilarityScore: 1 }),
    ).toEqual({ approved: false, reason: "business_closed" });
  });

  it("상호 유사도 미달이면 name_mismatch로 거절", () => {
    expect(
      classifyVerification({ hometaxValid: true, businessStatus: "01", nameSimilarityScore: 0.1 }),
    ).toEqual({ approved: false, reason: "name_mismatch" });
  });

  it("모두 통과하면 승인", () => {
    expect(
      classifyVerification({ hometaxValid: true, businessStatus: "01", nameSimilarityScore: 0.9 }),
    ).toEqual({ approved: true, reason: null });
  });
});
