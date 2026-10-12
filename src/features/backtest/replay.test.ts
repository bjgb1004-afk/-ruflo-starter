import { replay, hitDescription, FIXED_PRIZE } from "./replay";
import type { LottoDraw } from "./types";

const draw = (
  round: number,
  numbers: number[],
  bonus: number,
  prizePerWin?: LottoDraw["prizePerWin"],
): LottoDraw => ({
  round,
  numbers,
  bonus,
  drawDate: "2024-01-01",
  prizePerWin,
});

describe("replay", () => {
  const ticket = [1, 2, 3, 4, 5, 6];

  it("등수에 든 회차만 모은다", () => {
    const r = replay(ticket, [
      draw(1, [1, 2, 3, 40, 41, 42], 43), // 3개 -> 5등
      draw(2, [10, 20, 30, 40, 41, 42], 43), // 0개 -> 등수 없음
      draw(3, [1, 2, 3, 4, 41, 42], 43), // 4개 -> 4등
    ]);

    expect(r.roundsPlayed).toBe(3);
    expect(r.hits.map((h) => h.round)).toEqual([3, 1]); // 최근 회차가 앞
    expect(r.rankCounts).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
    expect(r.best?.round).toBe(3);
    expect(r.from).toBe(1);
    expect(r.to).toBe(3);
  });

  it("목록은 등수와 무관하게 최근 회차부터 내려간다", () => {
    const r = replay(ticket, [
      draw(10, [1, 2, 3, 4, 41, 42], 43), // 4등 - 성적은 더 좋지만 옛 회차
      draw(20, [1, 2, 3, 40, 41, 42], 43), // 5등 - 최근
      draw(30, [1, 2, 3, 43, 44, 45], 42), // 5등 - 가장 최근
    ]);
    expect(r.hits.map((h) => h.round)).toEqual([30, 20, 10]);
    // 최고 기록은 정렬과 따로 고른다 - 목록 맨 앞이 아니라 등수가 제일 높은 회차다.
    expect(r.best?.round).toBe(10);
    expect(r.best?.rank).toBe(4);
  });

  it("최고 기록이 동률이면 최근 회차를 쓴다", () => {
    const r = replay(ticket, [
      draw(10, [1, 2, 3, 40, 41, 42], 43),
      draw(20, [1, 2, 3, 43, 44, 45], 42),
    ]);
    expect(r.best?.round).toBe(20);
  });

  it("5개 + 보너스는 2등, 보너스 없으면 3등", () => {
    const withBonus = replay(ticket, [draw(1, [1, 2, 3, 4, 5, 40], 6)]);
    expect(withBonus.hits[0].rank).toBe(2);
    expect(withBonus.hits[0].bonusMatched).toBe(true);
    expect(hitDescription(withBonus.hits[0])).toBe("5개 + 보너스");

    const without = replay(ticket, [draw(1, [1, 2, 3, 4, 5, 40], 41)]);
    expect(without.hits[0].rank).toBe(3);
    expect(hitDescription(without.hits[0])).toBe("5개 맞음");
  });

  it("3·4개 맞은 회차에 보너스가 섞여도 등수는 그대로다", () => {
    // 1,2,3 맞고 보너스 4까지 내 번호에 있지만 5등은 5등이다.
    const r = replay(ticket, [draw(1, [1, 2, 3, 40, 41, 42], 4)]);
    expect(r.hits[0].rank).toBe(5);
    expect(r.hits[0].bonusMatched).toBe(false);
  });

  it("한 번도 못 들면 best가 null", () => {
    const r = replay(ticket, [draw(1, [10, 20, 30, 40, 41, 42], 43)]);
    expect(r.hits).toEqual([]);
    expect(r.best).toBeNull();
  });

  it("번호가 6개가 아니거나 중복이면 거부한다", () => {
    expect(() => replay([1, 2, 3, 4, 5], [])).toThrow();
    expect(() => replay([1, 1, 2, 3, 4, 5], [])).toThrow();
  });
});

describe("놓친 당첨금", () => {
  const ticket = [1, 2, 3, 4, 5, 6];

  it("4·5등은 법정 고정액으로, 1~3등은 그 회차 금액으로 더한다", () => {
    const r = replay(ticket, [
      draw(1, [1, 2, 3, 40, 41, 42], 43), // 5등
      draw(2, [1, 2, 3, 4, 41, 42], 43), // 4등
      draw(3, [1, 2, 3, 4, 5, 40], 41, { 3: 1_500_000 }), // 3등
    ]);

    expect(r.prizeByRank[5]).toBe(FIXED_PRIZE[5]);
    expect(r.prizeByRank[4]).toBe(FIXED_PRIZE[4]);
    expect(r.prizeByRank[3]).toBe(1_500_000);
    expect(r.totalPrize).toBe(1_555_000);
  });

  it("같은 등수가 여러 번이면 합산한다", () => {
    const r = replay(ticket, [
      draw(1, [1, 2, 3, 40, 41, 42], 43),
      draw(2, [1, 2, 3, 43, 44, 45], 42),
      draw(3, [4, 5, 6, 40, 41, 42], 43),
    ]);
    expect(r.rankCounts[5]).toBe(3);
    expect(r.totalPrize).toBe(FIXED_PRIZE[5] * 3);
  });

  it("회차 금액이 없는 등수는 합계에 넣지 않고 '모른다'로 표시한다", () => {
    const r = replay(ticket, [draw(1, [1, 2, 3, 4, 5, 40], 41)]); // 3등인데 금액 없음
    expect(r.hits[0].rank).toBe(3);
    expect(r.hits[0].prizeKnown).toBe(false);
    expect(r.hits[0].prize).toBe(0);
    expect(r.totalPrize).toBe(0);
    expect(r.unknownByRank[3]).toBe(1);
    expect(r.prizeUnknownCount).toBe(1);
  });

  // 실제 버그(2026-10-12): draw_history의 1등 금액이 1226회 이전 전부 비어 있어서, 과거 1등
  // 번호를 넣으면 "1등 · 0원"이 떴다. 0원과 "금액 모름"이 구분되지 않은 것이 화면 쪽 원인이다.
  it("1등을 맞혔는데 금액을 모르면 0원이 아니라 '모른다'로 나온다", () => {
    const r = replay(ticket, [draw(1, [1, 2, 3, 4, 5, 6], 7)]); // 6개 일치 = 1등, 금액 없음
    expect(r.hits[0].rank).toBe(1);
    expect(r.hits[0].prizeKnown).toBe(false);
    expect(r.unknownByRank[1]).toBe(1);
    expect(r.prizeByRank[1]).toBe(0);
  });

  it("1등 금액이 있으면 그 금액으로 더한다", () => {
    const r = replay(ticket, [draw(1, [1, 2, 3, 4, 5, 6], 7, { 1: 2_592_525_282 })]);
    expect(r.hits[0].prizeKnown).toBe(true);
    expect(r.hits[0].prize).toBe(2_592_525_282);
    expect(r.totalPrize).toBe(2_592_525_282);
    expect(r.prizeUnknownCount).toBe(0);
  });

  it("같은 등수에 금액을 아는 회차와 모르는 회차가 섞이면 아는 것만 더한다", () => {
    const r = replay(ticket, [
      draw(1, [1, 2, 3, 4, 5, 40], 41, { 3: 1_500_000 }), // 3등, 금액 있음
      draw(2, [1, 2, 3, 4, 5, 44], 45), // 3등, 금액 없음
    ]);
    expect(r.rankCounts[3]).toBe(2);
    expect(r.prizeByRank[3]).toBe(1_500_000);
    expect(r.unknownByRank[3]).toBe(1);
    expect(r.totalPrize).toBe(1_500_000);
  });

  it("당첨이 없으면 0원", () => {
    const r = replay(ticket, [draw(1, [10, 20, 30, 40, 41, 42], 43)]);
    expect(r.totalPrize).toBe(0);
  });
});
