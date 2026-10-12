import { tallyGeneratedTickets } from "./tallyGeneratedTickets";
import type { LottoDraw } from "../../../src/features/backtest/types";

// 1246회를 가정한 당첨번호. 1등 금액은 알고, 2등 금액은 아직 공개되지 않은 상태로 둔다.
const DRAW: LottoDraw = {
  round: 1246,
  numbers: [1, 2, 3, 4, 5, 6],
  bonus: 7,
  prizePerWin: { 1: 2_000_000_000, 3: 1_500_000 },
};

describe("코너별 성적 집계", () => {
  it("등수별 건수와 당첨금을 코너별로 나눠 센다", () => {
    const stats = tallyGeneratedTickets(
      [
        { source: "genius:archimedes", numbers: [1, 2, 3, 4, 5, 6] }, // 1등
        { source: "genius:archimedes", numbers: [1, 2, 3, 4, 5, 9] }, // 5개 + 보너스 아님 = 3등
        { source: "band", numbers: [1, 2, 3, 4, 10, 11] }, // 4등
        { source: "band", numbers: [1, 2, 3, 20, 21, 22] }, // 5등
        { source: "band", numbers: [10, 11, 12, 13, 14, 15] }, // 낙첨
      ],
      DRAW,
    );

    const genius = stats.get("genius:archimedes")!;
    expect(genius.games).toBe(2);
    expect(genius.rank[1]).toBe(1);
    expect(genius.rank[3]).toBe(1);
    expect(genius.prizeTotal).toBe(2_000_000_000 + 1_500_000);
    expect(genius.prizeUnknown).toBe(0);

    const band = stats.get("band")!;
    expect(band.games).toBe(3);
    expect(band.rank[4]).toBe(1);
    expect(band.rank[5]).toBe(1);
    // 4등 5만원 + 5등 5천원. 회차와 무관한 고정 금액이다.
    expect(band.prizeTotal).toBe(55_000);
  });

  it("5개 + 보너스는 2등이다", () => {
    const stats = tallyGeneratedTickets([{ source: "band", numbers: [1, 2, 3, 4, 5, 7] }], DRAW);
    expect(stats.get("band")!.rank[2]).toBe(1);
  });

  it("금액이 공개되지 않은 등수는 합계에 안 넣고 따로 센다 - 0원으로 찍으면 거짓말이 된다", () => {
    const stats = tallyGeneratedTickets([{ source: "band", numbers: [1, 2, 3, 4, 5, 7] }], DRAW);
    const band = stats.get("band")!;
    expect(band.rank[2]).toBe(1);
    expect(band.prizeTotal).toBe(0);
    expect(band.prizeUnknown).toBe(1);
  });

  it("번호가 없으면 빈 집계", () => {
    expect(tallyGeneratedTickets([], DRAW).size).toBe(0);
  });
});
