import { replay, hitDescription } from "./replay";
import type { LottoDraw } from "./types";

const draw = (round: number, numbers: number[], bonus: number): LottoDraw => ({
  round,
  numbers,
  bonus,
  drawDate: "2024-01-01",
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
    expect(r.hits.map((h) => h.round)).toEqual([3, 1]); // 성적 좋은 순
    expect(r.rankCounts).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
    expect(r.best?.round).toBe(3);
    expect(r.from).toBe(1);
    expect(r.to).toBe(3);
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
