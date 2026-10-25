import {
  CLAIM_WARNING_DAYS,
  findClaimDeadlineWarning,
  type ClaimDeadlineRound,
} from "./claimDeadline";

/** 테스트용 회차 한 줄. 이 기능이 보는 필드만 담는다. */
const round = (game_name: string, round_no: number, claim_end_date: string | null): ClaimDeadlineRound => ({
  game_name,
  round_no,
  claim_end_date,
});

/** KST 정오 - 시간대 경계에 걸리지 않는 안전한 "그 날" */
const kstNoon = (date: string) => new Date(`${date}T03:00:00Z`);

describe("findClaimDeadlineWarning", () => {
  it("마감이 가까운 회차를 찾아 남은 날수를 센다", () => {
    const w = findClaimDeadlineWarning(
      [round("스피또1000", 97, "2026-10-31")],
      kstNoon("2026-10-25"),
    );
    expect(w?.daysLeft).toBe(6);
    expect(w?.claimEndDate).toBe("2026-10-31");
    expect(w?.roundLabels).toEqual(["스피또1000 97회"]);
  });

  it(`딱 ${CLAIM_WARNING_DAYS}일 남은 건 알리고, 하루 더 남은 건 안 알린다`, () => {
    const rounds = [round("스피또1000", 97, "2026-11-08")]; // 10-25에서 14일
    expect(findClaimDeadlineWarning(rounds, kstNoon("2026-10-25"))?.daysLeft).toBe(CLAIM_WARNING_DAYS);
    expect(findClaimDeadlineWarning(rounds, kstNoon("2026-10-24"))).toBeNull(); // 15일
  });

  it("오늘이 마감이면 알린다 (0일 남음)", () => {
    const w = findClaimDeadlineWarning([round("스피또500", 47, "2026-10-25")], kstNoon("2026-10-25"));
    expect(w?.daysLeft).toBe(0);
    expect(w?.headline).toContain("오늘");
  });

  it("이미 지난 마감은 알리지 않는다", () => {
    expect(
      findClaimDeadlineWarning([round("스피또500", 47, "2026-10-24")], kstNoon("2026-10-25")),
    ).toBeNull();
  });

  it("마감일이 여러 개면 가장 이른 날만, 그 날 회차는 모두 모은다", () => {
    const w = findClaimDeadlineWarning(
      [
        round("스피또1000", 99, "2026-11-30"), // 더 먼 마감 - 섞이면 안 된다
        round("스피또2000", 62, "2026-10-31"),
        round("스피또1000", 97, "2026-10-31"),
        round("스피또1000", 96, "2026-10-31"),
      ],
      kstNoon("2026-10-25"),
    );
    expect(w?.claimEndDate).toBe("2026-10-31");
    expect(w?.roundLabels).toHaveLength(3);
    expect(w?.detail).toContain("10월 31일");
    expect(w?.detail).not.toContain("99회");
  });

  it("마감일을 모르는 회차는 건너뛴다", () => {
    expect(findClaimDeadlineWarning([round("스피또1000", 97, null)], kstNoon("2026-10-25"))).toBeNull();
  });

  it("알릴 게 없으면 null - 화면이 아무것도 띄우지 않게", () => {
    expect(findClaimDeadlineWarning([], kstNoon("2026-10-25"))).toBeNull();
    expect(
      findClaimDeadlineWarning([round("스피또1000", 111, "2027-12-31")], kstNoon("2026-10-25")),
    ).toBeNull();
  });

  // 기기 시간대가 아니라 KST 달력으로 판단해야 한다. 같은 순간이라도 한국은 이미 다음 날이다.
  it("한국 날짜로 센다 - UTC로는 아직 전날인 순간", () => {
    // 2026-10-25T16:00Z = 한국 10월 26일 새벽 1시
    const w = findClaimDeadlineWarning(
      [round("스피또2000", 62, "2026-10-31")],
      new Date("2026-10-25T16:00:00Z"),
    );
    expect(w?.daysLeft).toBe(5); // 10-26 -> 10-31
  });

  it("하루 남으면 '내일'이라고 말한다", () => {
    const w = findClaimDeadlineWarning([round("스피또500", 47, "2026-10-26")], kstNoon("2026-10-25"));
    expect(w?.daysLeft).toBe(1);
    expect(w?.headline).toContain("내일");
  });
});
