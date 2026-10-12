import { seededRng } from "./engine";
import { GAUSSIAN_RECIPE, analyzeWithRecipe, computeNumberStats, passesFilters, recipeStrategy } from "./recipes";
import {
  frequencyZScore,
  sumDistribution,
  sumRangeForZ,
  sumZScore,
  theoreticalSumMean,
  theoreticalSumSd,
} from "./gaussian";
import { KOREA_LOTTO_6_45, type LottoDraw } from "./types";

const RULE = KOREA_LOTTO_6_45;

function makeDraws(count: number, seed = "fixture", startRound = 1): LottoDraw[] {
  const rng = seededRng(seed);
  const draws: LottoDraw[] = [];
  for (let i = 0; i < count; i++) {
    const pool = Array.from({ length: RULE.maxNumber }, (_, n) => n + 1);
    for (let j = 0; j < RULE.pickCount + 1; j++) {
      const k = j + Math.floor(rng() * (pool.length - j));
      [pool[j], pool[k]] = [pool[k], pool[j]];
    }
    draws.push({
      round: startRound + i,
      numbers: pool.slice(0, RULE.pickCount).sort((a, b) => a - b),
      bonus: pool[RULE.pickCount],
    });
  }
  return draws;
}

describe("합계의 이론 분포", () => {
  it("6/45 합계 평균은 정확히 138이다", () => {
    expect(theoreticalSumMean(RULE)).toBe(138);
  });

  it("표준편차는 약 29.95다", () => {
    // √(6 × 39 × 46 / 12)
    expect(theoreticalSumSd(RULE)).toBeCloseTo(29.9499, 3);
  });

  it("표준점수는 평균에서 0, +1σ에서 1이다", () => {
    expect(sumZScore(138, RULE)).toBe(0);
    expect(sumZScore(138 + theoreticalSumSd(RULE), RULE)).toBeCloseTo(1, 10);
    expect(sumZScore(21, RULE)).toBeLessThan(-3.5);
    expect(sumZScore(255, RULE)).toBeGreaterThan(3.5);
  });

  it("±1σ 구간은 109~167이다", () => {
    expect(sumRangeForZ(1, RULE)).toEqual([109, 167]);
    // ±2σ, ±3σ도 안쪽으로 자른다.
    expect(sumRangeForZ(2, RULE)).toEqual([79, 197]);
    expect(sumRangeForZ(3, RULE)).toEqual([49, 227]);
  });
});

describe("과거 합계 실측 분포", () => {
  it("무작위 회차의 실측 평균·표준편차가 이론값 근처에 떨어진다", () => {
    const dist = sumDistribution(makeDraws(1200), RULE)!;
    expect(dist.rounds).toBe(1200);
    expect(dist.theoreticalMean).toBe(138);
    // 1,200회 표본의 평균 표준오차는 29.95/√1200 ≈ 0.86. 5 이상 벌어지면 셈이 틀린 것이다.
    expect(Math.abs(dist.mean - 138)).toBeLessThan(5);
    expect(Math.abs(dist.sd - dist.theoreticalSd)).toBeLessThan(3);
    // 정규분포라면 ±1σ 안에 약 68%가 들어온다.
    expect(dist.withinOneSd).toBeGreaterThan(0.6);
    expect(dist.withinOneSd).toBeLessThan(0.76);
  });

  it("회차가 없으면 null", () => {
    expect(sumDistribution([], RULE)).toBeNull();
  });
});

describe("번호별 출현 횟수 표준점수", () => {
  it("기대치만큼 나오면 0이다", () => {
    // 450회면 번호당 기대 60회
    expect(frequencyZScore(60, 450, RULE)).toBe(0);
    expect(frequencyZScore(70, 450, RULE)).toBeGreaterThan(0);
    expect(frequencyZScore(50, 450, RULE)).toBeLessThan(0);
  });

  it("회차가 없으면 0", () => {
    expect(frequencyZScore(0, 0, RULE)).toBe(0);
  });

  it("무작위 데이터에서 |z|가 3을 넘는 번호는 없다", () => {
    const stats = computeNumberStats(makeDraws(1200), RULE, 50);
    const maxAbsZ = Math.max(...stats.map((s) => Math.abs(s.frequencyZ)));
    expect(maxAbsZ).toBeLessThan(3);
    // 전체 빈도 합은 회차 × 6이어야 한다(z 계산의 입력이 맞는지 같이 본다).
    expect(stats.reduce((s, x) => s + x.totalFrequency, 0)).toBe(1200 * RULE.pickCount);
  });
});

describe("가우시안 레시피", () => {
  it("후보 15개를 내고 합계가 ±1σ 안인 조합만 만든다", () => {
    const history = makeDraws(300);
    const candidates = analyzeWithRecipe(GAUSSIAN_RECIPE, history, RULE, 301).candidates.map((c) => c.number);
    expect(candidates).toHaveLength(15);

    const tickets = recipeStrategy(GAUSSIAN_RECIPE).generate({
      history,
      rule: RULE,
      rng: seededRng("gaussian"),
      ticketCount: 5,
      targetRound: 301,
    });
    expect(tickets).toHaveLength(5);
    for (const t of tickets) {
      expect(t.every((n) => candidates.includes(n))).toBe(true);
      const sum = t.reduce((s, n) => s + n, 0);
      expect(Math.abs(sumZScore(sum, RULE))).toBeLessThanOrEqual(1);
      expect(passesFilters(t, RULE, GAUSSIAN_RECIPE.filters)).toBe(true);
    }
  });

  it("기대치에서 멀리 벗어난 번호는 후보에서 밀린다", () => {
    // 1번만 비정상적으로 많이 나온 역사를 만든다 - |z|가 커져 후보에서 빠져야 한다.
    const history = makeDraws(300);
    const skewed = history.map((d, i) =>
      i % 2 === 0 ? { ...d, numbers: [1, ...d.numbers.filter((n) => n !== 1).slice(0, 5)].sort((a, b) => a - b) } : d,
    );
    const stats = computeNumberStats(skewed, RULE, 50);
    expect(stats[0].frequencyZ).toBeGreaterThan(3);

    const candidates = analyzeWithRecipe(GAUSSIAN_RECIPE, skewed, RULE, 301).candidates.map((c) => c.number);
    expect(candidates).not.toContain(1);
  });
});
