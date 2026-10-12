import { seededRng } from "./engine";
import { ARCHIMEDES_RECIPE, PASCAL_RECIPE, analyzeWithRecipe, recipeStrategy } from "./recipes";
import {
  candidateHitProbability,
  candidateHitProbabilityAtLeast,
  combinations,
  countCombinationsByShape,
  countPassingCombinations,
  expectedCandidateHits,
  measureCandidateHits,
  totalCombinations,
} from "./pascal";
import { KOREA_LOTTO_6_45, type LottoDraw } from "./types";

const RULE = KOREA_LOTTO_6_45;

/** backtest.test.ts와 같은 방식의 가짜 회차. 균등 무작위라 어떤 분석법도 유리하지 않다. */
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

describe("이항계수", () => {
  it("파스칼 삼각형의 한 줄과 맞는다", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((k) => combinations(6, k))).toEqual([1, 6, 15, 20, 15, 6, 1]);
    expect(combinations(5, 7)).toBe(0);
  });

  it("6/45 전체 조합은 8,145,060개다", () => {
    expect(totalCombinations(RULE)).toBe(8145060);
    expect(combinations(15, 6)).toBe(5005);
  });
});

describe("모양별 조합 수", () => {
  it("조건을 걸지 않으면 전체 조합 수가 나온다", () => {
    expect(countCombinationsByShape(RULE, {})).toBe(totalCombinations(RULE));
  });

  it("홀짝 3:3 조합 수는 C(23,3)×C(22,3)와 같다", () => {
    // 1~45에 홀수 23개, 짝수 22개.
    const expected = combinations(23, 3) * combinations(22, 3);
    expect(countCombinationsByShape(RULE, { oddEven: [[3, 3]] })).toBe(expected);
    // C(23,3) = 1,771, C(22,3) = 1,540
    expect(expected).toBe(2727340);
  });

  it("저고 3:3 조합 수는 C(22,3)×C(23,3)와 같다", () => {
    // 저는 1~22(22개), 고는 23~45(23개).
    expect(countCombinationsByShape(RULE, { lowHigh: [[3, 3]] })).toBe(combinations(22, 3) * combinations(23, 3));
  });

  it("홀짝 전 구간을 더하면 전체가 된다", () => {
    const all = countCombinationsByShape(RULE, {
      oddEven: [
        [0, 6],
        [1, 5],
        [2, 4],
        [3, 3],
        [4, 2],
        [5, 1],
        [6, 0],
      ],
    });
    expect(all).toBe(totalCombinations(RULE));
  });

  it("합계 범위를 좁히면 조합 수가 줄어든다", () => {
    const narrow = countCombinationsByShape(RULE, { sumRange: [100, 175] });
    expect(narrow).toBeLessThan(totalCombinations(RULE));
    // 합계 21은 1+2+3+4+5+6뿐이다.
    expect(countCombinationsByShape(RULE, { sumRange: [21, 21] })).toBe(1);
    // 합계 255는 40+41+42+43+44+45뿐이다.
    expect(countCombinationsByShape(RULE, { sumRange: [255, 255] })).toBe(1);
  });

  it("파스칼 레시피가 남기는 조합 수는 전체의 일부다", () => {
    const passing = countCombinationsByShape(RULE, PASCAL_RECIPE.filters);
    expect(passing).toBeGreaterThan(0);
    expect(passing).toBeLessThan(totalCombinations(RULE));
  });
});

describe("후보 압축의 기대 성능", () => {
  it("45에서 15개를 남기면 기대 적중은 정확히 2개다", () => {
    expect(expectedCandidateHits(15, RULE)).toBe(2);
    expect(expectedCandidateHits(RULE.maxNumber, RULE)).toBe(RULE.pickCount);
  });

  it("적중 개수 확률의 합은 1이다", () => {
    const total = [0, 1, 2, 3, 4, 5, 6].reduce((s, k) => s + candidateHitProbability(k, 15, RULE), 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("후보 15개에 6개가 다 들어올 확률은 C(15,6)/C(45,6)다", () => {
    expect(candidateHitProbability(6, 15, RULE)).toBeCloseTo(5005 / 8145060, 12);
  });

  it("3개 이상 들어올 확률은 절반에 못 미친다", () => {
    const p = candidateHitProbabilityAtLeast(3, 15, RULE);
    expect(p).toBeGreaterThan(0.2);
    expect(p).toBeLessThan(0.4);
  });
});

describe("후보 압축 실측", () => {
  it("무작위 데이터에서는 실측 평균이 기대값 근처에 떨어진다", () => {
    const result = measureCandidateHits(ARCHIMEDES_RECIPE, makeDraws(400), RULE, { rounds: 200 });
    expect(result).not.toBeNull();
    expect(result!.rounds).toBe(200);
    expect(result!.candidateCount).toBe(15);
    expect(result!.expectedHits).toBe(2);
    // 200회 표본의 평균 표준오차는 약 0.08개다. 0.5개까지 벌어지면 셈이 잘못된 것이다.
    expect(Math.abs(result!.meanHits - 2)).toBeLessThan(0.5);
    expect(result!.hitCounts.reduce((s, c) => s + c, 0)).toBe(200);
  });

  it("데이터가 최소 기간보다 적으면 null", () => {
    expect(measureCandidateHits(ARCHIMEDES_RECIPE, makeDraws(50), RULE, { minimumHistory: 100 })).toBeNull();
  });

  it("후보를 압축하지 않는 레시피는 당첨번호 6개가 늘 후보 안에 있다", () => {
    const result = measureCandidateHits(PASCAL_RECIPE, makeDraws(150), RULE, { rounds: 20 });
    expect(result!.meanHits).toBe(RULE.pickCount);
    expect(result!.atLeast3Ratio).toBe(1);
  });
});

describe("후보에서 나오는 조합 수", () => {
  it("필터가 없으면 C(15,6)이다", () => {
    const candidates = Array.from({ length: 15 }, (_, i) => i + 1);
    expect(countPassingCombinations(candidates, RULE, {})).toBe(5005);
  });

  it("아르키메데스 후보 15개로 만들 수 있는 조합은 5,005개 중 일부다", () => {
    const history = makeDraws(300);
    const candidates = analyzeWithRecipe(ARCHIMEDES_RECIPE, history, RULE, 301).candidates.map((c) => c.number);
    const passing = countPassingCombinations(candidates, RULE, ARCHIMEDES_RECIPE.filters);
    expect(passing).toBeGreaterThan(0);
    expect(passing).toBeLessThan(5005);

    // 화면에 나가는 5게임은 모두 그 통과 조합 안에서 나온다.
    const tickets = recipeStrategy(ARCHIMEDES_RECIPE).generate({
      history,
      rule: RULE,
      rng: seededRng("pascal-check"),
      ticketCount: 5,
      targetRound: 301,
    });
    for (const t of tickets) expect(t.every((n) => candidates.includes(n))).toBe(true);
  });
});
