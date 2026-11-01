import { winNotificationText, type WinToNotify } from "./winNotificationText";
import type { WinRank } from "@/features/qr/checkWinnings";

/** 테스트용 당첨 한 건. */
const win = (rank: WinRank, prizeAmount: number, drawNo = 1249): WinToNotify => ({
  drawNo,
  rank,
  prizeAmount,
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
});
