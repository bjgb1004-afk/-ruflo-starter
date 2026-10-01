import { countMatches, rankOf, runBacktest, runRecipes, seededRng, splitByRatio, validateDraws } from "./engine";
import {
  FREQUENCY_RECIPE,
  HOT_COLD_RECIPE,
  ROUND_GROUP_RECIPE,
  PATTERN_RECIPE,
  PRESET_RECIPES,
  RANDOM_RECIPE,
  analyzeWithRecipe,
  computeNumberStats,
  emptyRecipe,
  groupOf,
  passesFilters,
  recipeStrategy,
  scoreNumbers,
  topCandidates,
} from "./recipes";
import {
  bootstrapMeanCI,
  judgeResults,
  matchProbability,
  monteCarloAtLeast,
  pairedPermutationTest,
  theoreticalMeanMatches,
  verdictLabel,
  type StrategyVerdict,
} from "./significance";
import { DEFAULT_OPTIONS, KOREA_LOTTO_6_45, ZERO_WEIGHTS, type LottoDraw, type Strategy } from "./types";

const RULE = KOREA_LOTTO_6_45;

/** 재현 가능한 가짜 회차 데이터. 실제 추첨처럼 균등 무작위로 만든다. */
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

const OPTIONS = { ...DEFAULT_OPTIONS, rule: RULE, minimumHistory: 50, ticketCount: 10 };
const PRESET_STRATEGIES = PRESET_RECIPES.map(recipeStrategy);

describe("재현성", () => {
  it("같은 seed면 같은 난수열", () => {
    const a = Array.from({ length: 20 }, seededRng("x"));
    const b = Array.from({ length: 20 }, seededRng("x"));
    expect(a).toEqual(b);
    expect(a).not.toEqual(Array.from({ length: 20 }, seededRng("y")));
  });

  it("같은 레시피·같은 seed면 결과 전체가 같다", () => {
    const draws = makeDraws(200);
    const a = runRecipes(draws, PRESET_RECIPES, OPTIONS);
    const b = runRecipes(draws, PRESET_RECIPES, OPTIONS);
    expect(a.results).toEqual(b.results);
  });

  it("seed가 다르면 결과가 달라진다", () => {
    const draws = makeDraws(200);
    const a = runRecipes(draws, PRESET_RECIPES, OPTIONS);
    const b = runRecipes(draws, PRESET_RECIPES, { ...OPTIONS, seed: "다른시드" });
    expect(a.results[0].matchCounts).not.toEqual(b.results[0].matchCounts);
  });

  it("쓰인 레시피가 meta에 그대로 남는다", () => {
    const run = runRecipes(makeDraws(200), [RANDOM_RECIPE, HOT_COLD_RECIPE], OPTIONS);
    expect(run.meta.recipes).toEqual([RANDOM_RECIPE, HOT_COLD_RECIPE]);
  });
});

describe("미래 데이터 누수 차단", () => {
  it("전략에 넘어온 history는 항상 대상 회차 이전까지만이다", () => {
    const draws = makeDraws(200);
    const seen: { lastRound: number; targetRound: number }[] = [];

    const spy: Strategy = {
      id: "spy",
      name: "감시",
      generate(context) {
        seen.push({
          lastRound: context.history[context.history.length - 1].round,
          targetRound: context.targetRound,
        });
        return recipeStrategy(RANDOM_RECIPE).generate(context);
      },
    };

    const run = runBacktest(draws, [spy], OPTIONS);
    expect(seen).toHaveLength(run.results[0].perRound.length);
    for (const s of seen) {
      expect(s.lastRound).toBe(s.targetRound - 1);
    }
  });

  it("전략이 받는 targetRound에는 당첨번호가 딸려오지 않는다", () => {
    const draws = makeDraws(200);
    const probe: Strategy = {
      id: "probe",
      name: "탐침",
      generate(context) {
        // context에 노출된 것은 회차 번호뿐이다.
        expect(Object.keys(context).sort()).toEqual(["history", "rng", "rule", "targetRound", "ticketCount"]);
        expect(context.history.some((d) => d.round >= context.targetRound)).toBe(false);
        return recipeStrategy(RANDOM_RECIPE).generate(context);
      },
    };
    expect(() => runBacktest(draws, [probe], OPTIONS)).not.toThrow();
  });

  it("과거 통계는 history 길이에 따라서만 변한다", () => {
    const draws = makeDraws(100);
    const at50 = computeNumberStats(draws.slice(0, 50), RULE, 10);
    const at80 = computeNumberStats(draws.slice(0, 80), RULE, 10);

    expect(at50).toEqual(computeNumberStats(draws.slice(0, 50), RULE, 10));
    expect(at50).not.toEqual(at80);
    expect(at50.reduce((s, x) => s + x.totalFrequency, 0)).toBe(50 * RULE.pickCount);
  });
});

describe("레시피 조합", () => {
  it("가중치를 바꾸면 후보가 바뀐다", () => {
    const history = makeDraws(300);
    const pick = (weights: Parameters<typeof scoreNumbers>[1]) =>
      analyzeWithRecipe({ ...emptyRecipe(), weights, candidateCount: 10 }, history, RULE, 301)
        .candidates.map((c) => c.number)
        .join(",");

    const byFrequency = pick({ ...ZERO_WEIGHTS, totalFrequency: 1 });
    const byGap = pick({ ...ZERO_WEIGHTS, gap: 1 });
    expect(byFrequency).not.toEqual(byGap);
  });

  it("가중치가 전부 0이면 점수가 같아 번호순 상위가 후보가 된다", () => {
    const history = makeDraws(300);
    const analysis = analyzeWithRecipe({ ...emptyRecipe(), candidateCount: 6 }, history, RULE, 301);
    expect(analysis.candidates.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("후보 압축 개수만큼만 번호를 쓴다", () => {
    const history = makeDraws(300);
    const recipe = { ...FREQUENCY_RECIPE, candidateCount: 12 };
    const tickets = recipeStrategy(recipe).generate({
      history,
      rule: RULE,
      rng: seededRng("c"),
      ticketCount: 30,
      targetRound: 301,
    });
    expect(new Set(tickets.flat()).size).toBeLessThanOrEqual(12);
  });

  it("무작위 레시피는 전체 번호를 쓴다", () => {
    const tickets = recipeStrategy(RANDOM_RECIPE).generate({
      history: makeDraws(300),
      rule: RULE,
      rng: seededRng("all"),
      ticketCount: 200,
      targetRound: 301,
    });
    expect(new Set(tickets.flat()).size).toBe(45);
  });

  it("top-score 방식은 점수 높은 후보들로 조합을 채운다", () => {
    const history = makeDraws(300);
    const recipe = { ...FREQUENCY_RECIPE, candidateCount: 12, selection: "top-score" as const };
    const analysis = analyzeWithRecipe(recipe, history, RULE, 301);
    const top6 = analysis.candidates.slice(0, 6).map((c) => c.number).sort((a, b) => a - b);

    const tickets = recipeStrategy(recipe).generate({
      history,
      rule: RULE,
      rng: seededRng("ts"),
      ticketCount: 5,
      targetRound: 301,
    });
    // 가장 점수가 높은 조합은 상위 6개 후보 그대로여야 한다.
    expect(tickets[0]).toEqual(top6);
  });
});

describe("오우치식 그룹", () => {
  it("회차를 주기로 끊어 그룹을 매긴다", () => {
    const grouping = { kind: "round-cycle" as const, groupCount: 10 };
    expect(groupOf(1240, grouping)).toBe(0);
    expect(groupOf(1244, grouping)).toBe(4);
    expect(groupOf(1250, grouping)).toBe(0);
  });

  it("그룹 통계는 같은 그룹 회차만 센다", () => {
    const draws = makeDraws(200);
    const grouping = { kind: "round-cycle" as const, groupCount: 10 };
    const stats = computeNumberStats(draws, RULE, 20, grouping, 3);

    const groupDraws = draws.filter((d) => groupOf(d.round, grouping) === 3);
    const expectedTotal = groupDraws.length * RULE.pickCount;
    expect(stats.reduce((s, x) => s + x.groupFrequency, 0)).toBe(expectedTotal);
    // 그룹 표본은 전체의 약 1/10이라 전체 빈도보다 작아야 한다.
    expect(expectedTotal).toBeLessThan(draws.length * RULE.pickCount);
  });

  it("대상 회차의 그룹이 결과에 실린다", () => {
    const analysis = analyzeWithRecipe(ROUND_GROUP_RECIPE, makeDraws(300), RULE, 1244);
    expect(analysis.targetGroup).toBe(4);
    expect(analysis.targetGroupLabel).toBe("E");
  });

  it("그룹 가중치만 켜면 그룹 없는 레시피와 후보가 달라진다", () => {
    const history = makeDraws(300);
    const withGroup = analyzeWithRecipe(
      { ...emptyRecipe(), weights: { ...ZERO_WEIGHTS, groupFrequency: 1 }, candidateCount: 10, grouping: { kind: "round-cycle", groupCount: 10 } },
      history,
      RULE,
      301,
    ).candidates.map((c) => c.number);
    const withoutGroup = analyzeWithRecipe(
      { ...emptyRecipe(), weights: { ...ZERO_WEIGHTS, totalFrequency: 1 }, candidateCount: 10 },
      history,
      RULE,
      301,
    ).candidates.map((c) => c.number);
    expect(withGroup).not.toEqual(withoutGroup);
  });
});

describe("조합 필터", () => {
  it("설정하지 않은 필터는 전부 통과시킨다", () => {
    expect(passesFilters([1, 2, 3, 4, 5, 6], RULE, {})).toBe(true);
  });

  it("홀짝·저고·합계·연속을 적용한다", () => {
    expect(passesFilters([1, 3, 5, 7, 9, 11], RULE, { oddEven: [[3, 3]] })).toBe(false);
    expect(passesFilters([1, 2, 3, 4, 5, 6], RULE, { oddEven: [[3, 3]] })).toBe(true);
    expect(passesFilters([1, 2, 3, 4, 5, 6], RULE, { lowHigh: [[3, 3]] })).toBe(false);
    expect(passesFilters([1, 2, 3, 40, 41, 42], RULE, { lowHigh: [[3, 3]] })).toBe(true);
    expect(passesFilters([1, 2, 3, 4, 5, 6], RULE, { sumRange: [100, 180] })).toBe(false);
    expect(passesFilters([1, 2, 3, 10, 20, 30], RULE, { maxConsecutive: 2 })).toBe(false);
    expect(passesFilters([1, 2, 10, 20, 30, 40], RULE, { maxConsecutive: 2 })).toBe(true);
  });

  it("끝수 중복을 제한한다", () => {
    // 3, 13, 23 은 끝수가 모두 3
    expect(passesFilters([3, 13, 23, 30, 41, 45], RULE, { maxSameEndingDigit: 2 })).toBe(false);
    expect(passesFilters([3, 13, 24, 30, 41, 45], RULE, { maxSameEndingDigit: 2 })).toBe(true);
  });

  it("직전 회차와 겹치는 개수를 제한한다", () => {
    const previous: LottoDraw = { round: 100, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 };
    expect(passesFilters([1, 2, 3, 10, 20, 30], RULE, { previousDrawOverlap: [0, 1] }, previous)).toBe(false);
    expect(passesFilters([1, 10, 20, 30, 40, 45], RULE, { previousDrawOverlap: [0, 1] }, previous)).toBe(true);
    expect(passesFilters([10, 20, 30, 40, 44, 45], RULE, { previousDrawOverlap: [1, 2] }, previous)).toBe(false);
  });

  it("필터를 켜도 티켓 수는 그대로 채운다", () => {
    const run = runRecipes(makeDraws(200), [PATTERN_RECIPE], OPTIONS);
    expect(run.results[0].totalTickets).toBe(run.results[0].drawsTested * 10);
  });

  it("아주 좁은 필터에서도 티켓 수를 맞춘다", () => {
    const impossible = { ...emptyRecipe(), filters: { sumRange: [21, 22] as [number, number] } };
    const run = runRecipes(makeDraws(200), [impossible], OPTIONS);
    expect(run.results[0].totalTickets).toBe(run.results[0].drawsTested * 10);
  });
});

describe("엔진이 잘못된 전략을 잡아낸다", () => {
  const draws = makeDraws(200);

  it("범위를 벗어나거나 중복된 번호", () => {
    const broken: Strategy = { id: "b", name: "고장", generate: () => Array.from({ length: 10 }, () => [1, 1, 2, 3, 4, 5]) };
    expect(() => runBacktest(draws, [broken], OPTIONS)).toThrow(/잘못된 조합/);

    const oor: Strategy = { id: "o", name: "범위밖", generate: () => Array.from({ length: 10 }, () => [1, 2, 3, 4, 5, 99]) };
    expect(() => runBacktest(draws, [oor], OPTIONS)).toThrow(/범위 밖/);
  });

  it("티켓 수가 모자란 전략", () => {
    const lazy: Strategy = { id: "l", name: "게으름", generate: () => [[1, 2, 3, 4, 5, 6]] };
    expect(() => runBacktest(draws, [lazy], OPTIONS)).toThrow(/1조합을 냈다/);
  });

  it("모든 레시피가 같은 회차·같은 티켓 수로 비교된다", () => {
    const run = runRecipes(draws, PRESET_RECIPES, OPTIONS);
    const rounds = run.results.map((r) => r.perRound.map((p) => p.round));
    for (const r of rounds) expect(r).toEqual(rounds[0]);
    expect(new Set(run.results.map((r) => r.totalTickets)).size).toBe(1);
  });
});

describe("채점", () => {
  it("맞은 개수를 정확히 센다", () => {
    expect(countMatches([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6])).toBe(6);
    expect(countMatches([1, 2, 3, 40, 41, 42], [1, 2, 3, 4, 5, 6])).toBe(3);
    expect(countMatches([40, 41, 42, 43, 44, 45], [1, 2, 3, 4, 5, 6])).toBe(0);
  });

  it("등수를 정확히 매긴다", () => {
    expect(rankOf(6, false, RULE)).toBe(1);
    expect(rankOf(5, true, RULE)).toBe(2);
    expect(rankOf(5, false, RULE)).toBe(3);
    expect(rankOf(4, false, RULE)).toBe(4);
    expect(rankOf(3, false, RULE)).toBe(5);
    expect(rankOf(2, true, RULE)).toBeNull();
  });

  it("당첨번호를 그대로 낸 전략은 전 회차 1등이 된다", () => {
    const draws = makeDraws(120);
    const byRound = new Map(draws.map((d) => [d.round, d.numbers]));
    const cheater: Strategy = {
      id: "cheat",
      name: "정답지",
      generate: (context) => [[...byRound.get(context.targetRound)!]],
    };
    const run = runBacktest(draws, [cheater], { ...OPTIONS, ticketCount: 1 });
    expect(run.results[0].jackpot).toBe(run.results[0].drawsTested);
    expect(run.results[0].averageMatches).toBe(6);
  });
});

describe("데이터 검증", () => {
  it("중복·누락·범위이탈·보너스 오류를 잡는다", () => {
    const kinds = validateDraws(
      [
        { round: 1, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 },
        { round: 1, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 },
        { round: 4, numbers: [1, 2, 3, 4, 5, 99], bonus: 7 },
        { round: 5, numbers: [1, 1, 3, 4, 5, 6], bonus: 6 },
        { round: 6, numbers: [1, 2, 3, 4, 5], bonus: 7 },
      ],
      RULE,
    ).map((i) => i.kind);

    expect(kinds).toContain("duplicate-round");
    expect(kinds).toContain("missing-round");
    expect(kinds).toContain("out-of-range");
    expect(kinds).toContain("duplicate-number");
    expect(kinds).toContain("bad-number-count");
    expect(kinds).toContain("bad-bonus");
  });

  it("깨끗한 데이터는 문제를 만들지 않는다", () => {
    expect(validateDraws(makeDraws(100), RULE)).toEqual([]);
  });

  it("세트구를 쓰는 규칙에서 값이 이상하면 보고한다", () => {
    const issues = validateDraws([{ round: 1, numbers: [1, 2, 3, 4, 5, 6], bonus: 7, setBall: "Z" }], {
      ...RULE,
      setBallEnabled: true,
      setBallNames: ["A", "B"],
    });
    expect(issues.some((i) => i.kind === "bad-set-ball")).toBe(true);
  });
});

describe("데이터 분리", () => {
  it("training/validation/test가 회차 순서대로 겹치지 않게 나뉜다", () => {
    const split = splitByRatio(makeDraws(1000));
    expect(split.training.to).toBeLessThan(split.validation.from);
    expect(split.validation.to).toBeLessThan(split.test.from);
    expect(split.training.from).toBe(1);
    expect(split.test.to).toBe(1000);
  });
});

describe("통계 검정", () => {
  it("이론 기대 적중은 6/45에서 정확히 0.8이다", () => {
    expect(theoreticalMeanMatches(RULE)).toBeCloseTo(0.8, 10);
  });

  it("적중 개수 확률의 합은 1이고 1등 확률은 1/8,145,060", () => {
    expect([0, 1, 2, 3, 4, 5, 6].reduce((s, k) => s + matchProbability(k, RULE), 0)).toBeCloseTo(1, 10);
    expect(matchProbability(6, RULE)).toBeCloseTo(1 / 8_145_060, 12);
  });

  it("부트스트랩 신뢰구간이 평균을 감싼다", () => {
    const rng = seededRng("ci");
    const samples = Array.from({ length: 300 }, () => 0.8 + (rng() - 0.5) * 0.4);
    const ci = bootstrapMeanCI(samples, { seed: "ci-test" });
    expect(ci.lower).toBeLessThan(ci.mean);
    expect(ci.upper).toBeGreaterThan(ci.mean);
  });

  it("차이 없는 표본은 p가 크고, 확실히 다른 표본은 p가 작다", () => {
    const rng = seededRng("perm");
    const a = Array.from({ length: 200 }, () => rng());
    const b = Array.from({ length: 200 }, () => rng());
    expect(pairedPermutationTest(a, b, { seed: "p1" }).pValue).toBeGreaterThan(0.05);
    expect(pairedPermutationTest(a, a.map((v) => v + 0.5), { seed: "p2" }).pValue).toBeLessThan(0.01);
  });

  it("몬테카를로가 무작위에서 흔한 값과 드문 값을 가른다", () => {
    // 8,820게임에서 4개 이상 적중 기대값은 약 12건.
    const typical = monteCarloAtLeast(12, 8820, 4, RULE, { seed: "mc1" });
    expect(typical.randomMean).toBeGreaterThan(8);
    expect(typical.randomMean).toBeLessThan(16);
    expect(typical.probabilityAtLeastObserved).toBeGreaterThan(0.1);

    // 같은 조건에서 60건이 나왔다면 무작위로는 설명되지 않는다.
    expect(monteCarloAtLeast(60, 8820, 4, RULE, { seed: "mc2" }).probabilityAtLeastObserved).toBeLessThan(0.01);
  });

  it("1등처럼 드문 사건은 표본 부족으로 표시한다", () => {
    const run = runRecipes(makeDraws(300), PRESET_RECIPES, OPTIONS);
    const verdicts = judgeResults(run.results, RULE);
    const byMatches = new Map(verdicts[0].breakdown.map((b) => [b.matches, b]));
    expect(byMatches.get(6)!.insufficient).toBe(true);
    expect(byMatches.get(5)!.insufficient).toBe(true);
    expect(byMatches.get(0)!.insufficient).toBe(false);
  });

  it("관측 건수와 기대 건수를 따로 담는다", () => {
    const run = runRecipes(makeDraws(300), [RANDOM_RECIPE], OPTIONS);
    const [verdict] = judgeResults(run.results, RULE);
    // 기대값은 정수가 아니고, 관측값은 정수다. 둘을 같은 칸에 섞으면 화면에서 구분되지 않는다.
    const total = verdict.breakdown.reduce((s, b) => s + b.observed, 0);
    expect(total).toBe(run.results[0].totalTickets);
    const expectedTotal = verdict.breakdown.reduce((s, b) => s + b.expected, 0);
    expect(expectedTotal).toBeCloseTo(run.results[0].totalTickets, 6);
    expect(Number.isInteger(verdict.breakdown[6].expected)).toBe(false);
  });

  it("무작위 레시피는 무작위 기준선과 구분되지 않는다", () => {
    const run = runRecipes(makeDraws(600), [RANDOM_RECIPE, FREQUENCY_RECIPE, ROUND_GROUP_RECIPE], {
      ...OPTIONS,
      minimumHistory: 100,
    });
    const verdicts = judgeResults(run.results, RULE);
    // 무작위 데이터에 무작위 레시피이므로 차이가 나오면 검정 쪽이 잘못된 것이다.
    expect(verdicts[0].comparison).toBe("same");
  });

  it("기준선보다 낮아 벗어난 경우를 '높음'으로 읽지 않는다", () => {
    // 평균만 보고 판단하면 안 되는 이유 자체를 테스트로 박아 둔다. 실측에서 출현 빈도가
    // 0.7717(구간 상한 0.7997)로 기준선을 아래로 벗어났고, 그때 방향 없는 판정은 "차이 있음"만
    // 내놓아 최악의 방법이 특별해 보였다.
    const low: StrategyVerdict = {
      strategyId: "x",
      strategyName: "x",
      observedMean: 0.7717,
      theoreticalMean: 0.8,
      difference: 0.7717 - 0.8,
      ci: { mean: 0.7717, lower: 0.7457, upper: 0.7997, level: 0.95 },
      comparison: "below",
      atLeast4: monteCarloAtLeast(0, 100, 4, RULE),
      breakdown: [],
    };
    expect(verdictLabel(low)).toContain("낮음");
    expect(verdictLabel(low)).not.toContain("높");

    const high: StrategyVerdict = { ...low, comparison: "above", difference: 0.05 };
    expect(verdictLabel(high)).toContain("높음");

    const same: StrategyVerdict = { ...low, comparison: "same" };
    expect(verdictLabel(same)).toContain("차이 없음");

    // 구간으로는 높게 나왔지만 순열검정에서 우연으로 설명되면 그대로 적는다.
    const fluke: StrategyVerdict = {
      ...high,
      vsRandom: { observedDifference: 0.05, pValue: 0.35, iterations: 5000 },
    };
    expect(verdictLabel(fluke)).toContain("우연");
  });
});
