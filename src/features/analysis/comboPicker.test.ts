import { seededRng } from "@/features/backtest/engine";
import { KOREA_LOTTO_6_45 } from "@/features/backtest/types";
import { pickCombos } from "./comboPicker";

const RULE = KOREA_LOTTO_6_45;
const rng = () => seededRng("test");

describe("pickCombos", () => {
  it("필터가 없으면 후보의 모든 조합이 통과다", () => {
    const r = pickCombos({ candidates: [1, 2, 3, 4, 5, 6, 7], rule: RULE, filters: {}, count: 3, rng: rng() });
    expect(r.total).toBe(7); // C(7,6)
    expect(r.passing).toBe(7);
    expect(r.games).toHaveLength(3);
  });

  it("후보가 6개 미만이면 아무것도 못 만든다", () => {
    const r = pickCombos({ candidates: [1, 2, 3], rule: RULE, filters: {}, count: 5, rng: rng() });
    expect(r.total).toBe(0);
    expect(r.games).toEqual([]);
  });

  it("뽑은 조합은 전부 필터를 통과한다 - 개수를 맞추려고 조건을 버리지 않는다", () => {
    const r = pickCombos({
      candidates: Array.from({ length: 15 }, (_, i) => i + 1),
      rule: RULE,
      filters: { sumRange: [30, 40] },
      count: 50,
      rng: rng(),
    });
    for (const g of r.games) {
      const sum = g.reduce((s, n) => s + n, 0);
      expect(sum).toBeGreaterThanOrEqual(30);
      expect(sum).toBeLessThanOrEqual(40);
    }
    // 통과분보다 많이 달라고 해도 통과분까지만 준다
    expect(r.games.length).toBe(Math.min(50, r.passing));
  });

  it("고정 번호는 모든 조합에 들어간다", () => {
    const r = pickCombos({
      candidates: Array.from({ length: 12 }, (_, i) => i + 1),
      pinned: [7, 11],
      rule: RULE,
      filters: {},
      count: 5,
      rng: rng(),
    });
    expect(r.total).toBe(210); // C(10,4)
    for (const g of r.games) {
      expect(g).toContain(7);
      expect(g).toContain(11);
    }
  });

  it("고정 번호가 6개면 그 조합 하나뿐이다", () => {
    const r = pickCombos({
      candidates: [1, 2, 3, 4, 5, 6, 7, 8],
      pinned: [1, 2, 3, 4, 5, 6],
      rule: RULE,
      filters: {},
      count: 5,
      rng: rng(),
    });
    expect(r.total).toBe(1);
    expect(r.games).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("고정 번호가 7개면 만들 수 없다", () => {
    const r = pickCombos({
      candidates: [1, 2, 3, 4, 5, 6, 7],
      pinned: [1, 2, 3, 4, 5, 6, 7],
      rule: RULE,
      filters: {},
      count: 5,
      rng: rng(),
    });
    expect(r.total).toBe(0);
    expect(r.games).toEqual([]);
  });

  it("같은 시드면 같은 조합이 나온다", () => {
    const opts = {
      candidates: Array.from({ length: 15 }, (_, i) => i + 1),
      rule: RULE,
      filters: {},
      count: 5,
    };
    expect(pickCombos({ ...opts, rng: rng() }).games).toEqual(pickCombos({ ...opts, rng: rng() }).games);
  });

  it("뽑은 조합은 서로 다르고 번호는 오름차순이다", () => {
    const r = pickCombos({
      candidates: Array.from({ length: 20 }, (_, i) => i + 1),
      rule: RULE,
      filters: {},
      count: 10,
      rng: rng(),
    });
    const keys = r.games.map((g) => g.join(","));
    expect(new Set(keys).size).toBe(10);
    for (const g of r.games) expect([...g].sort((a, b) => a - b)).toEqual(g);
  });

  it("이월수 필터는 직전 회차를 받아 적용한다", () => {
    const previousDraw = { round: 100, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 };
    const r = pickCombos({
      candidates: Array.from({ length: 12 }, (_, i) => i + 1),
      rule: RULE,
      filters: { previousDrawOverlap: [0, 0] },
      count: 5,
      rng: rng(),
      previousDraw,
    });
    expect(r.games.length).toBeGreaterThan(0);
    for (const g of r.games) expect(g.some((n) => n <= 6)).toBe(false);
  });
});
