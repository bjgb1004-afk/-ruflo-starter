import { winNotificationText, type WinToNotify } from "./winNotificationText";
import type { WinRank } from "@/features/qr/checkWinnings";

/** 테스트용 당첨 한 건. 기본은 실제로 산 번호. */
const win = (rank: WinRank, prizeAmount: number, drawNo = 1249): WinToNotify => ({
  drawNo,
  rank,
  prizeAmount,
  purchased: true,
});

/** 생성기에서 뽑아 저장만 한 번호(안 산 것). */
const saved = (rank: WinRank, prizeAmount: number, drawNo = 1249): WinToNotify => ({
  ...win(rank, prizeAmount, drawNo),
  purchased: false,
});

describe("winNotificationText", () => {
  it("당첨이 없으면 알림을 만들지 않는다", () => {
    expect(winNotificationText([])).toBeNull();
  });

  it("한 게임이면 등수와 금액을 말한다", () => {
    const t = winNotificationText([win(4, 50_000)])!;
    expect(t.title).toBe("🎉 1249회 4등 당첨!");
    expect(t.body).toContain("50,000원");
  });

  it("여러 게임이면 개수와 합계를 말하고 가장 높은 등수를 앞에 둔다", () => {
    const t = winNotificationText([win(5, 5_000), win(4, 50_000), win(5, 5_000)])!;
    expect(t.title).toBe("🎉 1249회 3게임 당첨!");
    expect(t.body).toContain("4등");
    expect(t.body).toContain("60,000원");
  });

  it("금액이 아직 집계 안 돼 0원이면 금액을 말하지 않는다", () => {
    // 1~3등은 회차별 변동 금액이라 추첨 직후엔 0으로 들어올 수 있다.
    const t = winNotificationText([win(1, 0)])!;
    expect(t.title).toBe("🎉 1249회 1등 당첨!");
    expect(t.body).not.toContain("원");
  });

  it("회차가 섞여 있으면 회차를 말하지 않는다", () => {
    const t = winNotificationText([win(5, 5_000, 1248), win(5, 5_000, 1249)])!;
    expect(t.title).toBe("🎉 2게임 당첨!");
  });

  it("안 산 번호는 당첨이라 말하지 않고, 받을 수 없다고 밝힌다", () => {
    const t = winNotificationText([saved(4, 50_000)])!;
    expect(t.title).not.toContain("당첨!");
    expect(t.title).toContain("저장한 번호");
    expect(t.body).toContain("받을 수는 없어요");
    expect(t.body).toContain("50,000원");
  });

  it("산 것과 안 산 것이 섞이면 산 것만으로 말한다", () => {
    // 안 산 번호의 금액을 합쳐 당첨금을 부풀리면 안 된다.
    const t = winNotificationText([saved(4, 50_000), win(5, 5_000)])!;
    expect(t.title).toBe("🎉 1249회 5등 당첨!");
    expect(t.body).toContain("5,000원");
    expect(t.body).not.toContain("55,000원");
  });
});
