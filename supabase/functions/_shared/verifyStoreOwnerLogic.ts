// Deno(Edge Function)와 Node(Jest) 양쪽에서 그대로 import되는 순수 로직 - Deno 전용 API를
// 쓰지 않는다. 실제 국세청 API 호출/DB 조회는 이 파일 밖(index.ts, hometax.ts)에서 하고,
// 여기는 "주어진 값으로 무엇을 판단할지"만 담당한다.

export const LOCKOUT_ATTEMPT_COUNT = 5;
export const LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000;
export const NAME_SIMILARITY_THRESHOLD = 0.3;

export interface VerificationAttempt {
  result: "approved" | "rejected";
  created_at: string; // ISO
}

// recentAttempts는 반드시 created_at 내림차순(최신이 먼저)으로 최근 N건을 넘겨야 한다.
export function evaluateLockout(
  recentAttempts: VerificationAttempt[],
  now: Date = new Date(),
): { locked: boolean; unlockAt: string | null } {
  if (recentAttempts.length < LOCKOUT_ATTEMPT_COUNT) {
    return { locked: false, unlockAt: null };
  }
  const lastFive = recentAttempts.slice(0, LOCKOUT_ATTEMPT_COUNT);
  const allRejected = lastFive.every((a) => a.result === "rejected");
  if (!allRejected) {
    return { locked: false, unlockAt: null };
  }
  const mostRecentFailAt = new Date(lastFive[0].created_at).getTime();
  const unlockAtMs = mostRecentFailAt + LOCKOUT_DURATION_MS;
  if (now.getTime() < unlockAtMs) {
    return { locked: true, unlockAt: new Date(unlockAtMs).toISOString() };
  }
  return { locked: false, unlockAt: null };
}

export function isNameSimilar(score: number, threshold: number = NAME_SIMILARITY_THRESHOLD): boolean {
  return score >= threshold;
}

export type RejectReason = "hometax_mismatch" | "business_closed" | "name_mismatch";

const CONTINUING_BUSINESS_STATUS_CODE = "01"; // 계속사업자

export function classifyVerification(input: {
  hometaxValid: boolean;
  businessStatus: string | null;
  nameSimilarityScore: number;
}): { approved: boolean; reason: RejectReason | null } {
  if (!input.hometaxValid) return { approved: false, reason: "hometax_mismatch" };
  if (input.businessStatus !== CONTINUING_BUSINESS_STATUS_CODE) {
    return { approved: false, reason: "business_closed" };
  }
  if (!isNameSimilar(input.nameSimilarityScore)) return { approved: false, reason: "name_mismatch" };
  return { approved: true, reason: null };
}
