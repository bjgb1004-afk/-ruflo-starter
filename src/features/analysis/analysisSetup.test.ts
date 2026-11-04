import { ZERO_WEIGHTS, type LottoDraw } from "@/features/backtest/types";
import { ALL_ROUNDS, defaultSetup, LAB_WEIGHT_KEYS, toRecipeWeights, windowOf } from "./analysisSetup";

const draws: LottoDraw[] = Array.from({ length: 10 }, (_, i) => ({
  round: i + 1,
  numbers: [1, 2, 3, 4, 5, 6],
  bonus: 7,
}));

describe("기본 설정", () => {
  it("가중치는 0~5 범위 안이다", () => {
    const s = defaultSetup();
    for (const key of LAB_WEIGHT_KEYS) {
      expect(s.weights[key]).toBeGreaterThanOrEqual(0);
      expect(s.weights[key]).toBeLessThanOrEqual(5);
    }
  });

  it("피보나치·서로소는 분석실 가중치에 없다 - 이미 다른 화면에 있고 과거 데이터와 무관하다", () => {
    expect(LAB_WEIGHT_KEYS).not.toContain("fibonacciAffinity");
    expect(LAB_WEIGHT_KEYS).not.toContain("totient");
  });

  it("후보 수는 10~20 사이다", () => {
    expect(defaultSetup().candidateCount).toBeGreaterThanOrEqual(10);
    expect(defaultSetup().candidateCount).toBeLessThanOrEqual(20);
  });

  it("가중치가 전부 0이 아니다 - 전부 0이면 점수 차이가 없어 후보가 번호순이 된다", () => {
    const total = LAB_WEIGHT_KEYS.reduce((s, k) => s + defaultSetup().weights[k], 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe("엔진 가중치로 바꾸기", () => {
  it("분석실에 없는 요소는 0으로 둔다", () => {
    const w = toRecipeWeights(defaultSetup());
    expect(w.fibonacciAffinity).toBe(0);
    expect(w.totient).toBe(0);
    expect(Object.keys(w).sort()).toEqual(Object.keys(ZERO_WEIGHTS).sort());
  });

  it("그룹을 안 쓰면 그룹 가중치를 0으로 만든다 - 그룹 통계가 전부 0이라 점수가 뒤틀린다", () => {
    const base = defaultSetup();
    const setup = {
      ...base,
      groupCount: undefined,
      weights: { ...base.weights, groupFrequency: 3, groupGap: 2 },
    };
    const w = toRecipeWeights(setup);
    expect(w.groupFrequency).toBe(0);
    expect(w.groupGap).toBe(0);
  });

  it("그룹을 쓰면 그룹 가중치가 그대로 넘어간다", () => {
    const base = defaultSetup();
    const setup = {
      ...base,
      groupCount: 10,
      weights: { ...base.weights, groupFrequency: 3, groupGap: 2 },
    };
    const w = toRecipeWeights(setup);
    expect(w.groupFrequency).toBe(3);
    expect(w.groupGap).toBe(2);
  });
});

describe("구간 자르기", () => {
  it("전체(0)는 전 회차를 쓴다", () => {
    expect(windowOf(draws, ALL_ROUNDS)).toHaveLength(10);
  });

  it("최근 N회는 뒤에서 N개다", () => {
    expect(windowOf(draws, 3).map((d) => d.round)).toEqual([8, 9, 10]);
  });

  it("데이터보다 긴 구간을 달라면 있는 만큼만 준다", () => {
    expect(windowOf(draws, 50)).toHaveLength(10);
  });
});
