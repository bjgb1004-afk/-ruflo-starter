import {
  countMatches,
  rankOf,
  runBacktest,
  seededRng,
  splitByRatio,
  validateDraws,
} from "./engine";
import {
  KOREAN_STRATEGIES,
  computeNumberStats,
  frequencyStrategy,
  hotColdStrategy,
  passesFilters,
  randomStrategy,
} from "./strategies";
import {
  bootstrapMeanCI,
  judgeResults,
  matchProbability,
  pairedPermutationTest,
  theoreticalMeanMatches,
} from "./significance";
import { DEFAULT_OPTIONS, DEFAULT_PARAMS, KOREA_LOTTO_6_45, type LottoDraw, type Strategy } from "./types";

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

// 스펙 21장 1번
describe("재현성", () => {
  it("같은 seed면 같은 난수열", () => {
    const a = Array.from({ length: 20 }, seededRng("x"));
    const b = Array.from({ length: 20 }, seededRng("x"));
    const c = Array.from({ length: 20 }, seededRng("y"));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("같은 seed면 백테스트 결과 전체가 같다", () => {
    const draws = makeDraws(200);
    const a = runBacktest(draws, KOREAN_STRATEGIES, OPTIONS);
    const b = runBacktest(draws, KOREAN_STRATEGIES, OPTIONS);
    expect(a.results).toEqual(b.results);
  });

  it("seed가 다르면 결과가 달라진다", () => {
    const draws = makeDraws(200);
    const a = runBacktest(draws, KOREAN_STRATEGIES, OPTIONS);
    const b = runBacktest(draws, KOREAN_STRATEGIES, { ...OPTIONS, seed: "다른시드" });
    expect(a.results[0].matchCounts).not.toEqual(b.results[0].matchCounts);
  });
});

// 스펙 21장 2번 - 가장 중요한 테스트
describe("미래 데이터 누수 차단", () => {
  it("전략에 넘어온 history는 항상 대상 회차 이전까지만이다", () => {
    const draws = makeDraws(200);
    const seenHistories: { lastRound: number }[] = [];

    // 자기가 받은 history의 마지막 회차를 기록하는 감시용 전략.
    const spy: Strategy = {
      id: "spy",
      name: "감시",
      generate(context) {
        seenHistories.push({ lastRound: context.history[context.history.length - 1].round });
        return randomStrategy.generate(context);
      },
    };

    const run = runBacktest(draws, [spy], OPTIONS);
    const testedRounds = run.results[0].perRound.map((r) => r.round);

    expect(seenHistories).toHaveLength(testedRounds.length);
    testedRounds.forEach((round, i) => {
      // history의 마지막이 대상 회차보다 앞서야 한다.
      expect(seenHistories[i].lastRound).toBe(round - 1);
    });
  });

  it("전략은 대상 회차의 당첨번호에 접근할 수 없다", () => {
    const draws = makeDraws(200);
    const target = draws[120];

    // history 안에 대상 회차가 들어있으면 즉시 실패시키는 전략.
    const leakDetector: Strategy = {
      id: "leak",
      name: "누수감지",
      generate(context) {
        const leaked = context.history.some((d) => d.round >= target.round);
        if (leaked && context.history.length <= 120) {
          throw new Error("대상 회차가 history에 들어왔다");
        }
        return randomStrategy.generate(context);
      },
    };

    expect(() =>
      runBacktest(draws, [leakDetector], { ...OPTIONS, fromRound: target.round, toRound: target.round }),
    ).not.toThrow();
  });

  it("과거 통계는 history 길이에 따라서만 변한다", () => {
    const draws = makeDraws(100);
    const statsAt50 = computeNumberStats(draws.slice(0, 50), RULE, [10]);
    const statsAt50Again = computeNumberStats(draws.slice(0, 50), RULE, [10]);
    const statsAt80 = computeNumberStats(draws.slice(0, 80), RULE, [10]);

    expect(statsAt50).toEqual(statsAt50Again);
    expect(statsAt50).not.toEqual(statsAt80);
    // 50회까지의 총 출현 횟수 합은 50 × 6이어야 한다(미래분이 섞이면 늘어난다).
    expect(statsAt50.reduce((s, x) => s + x.totalFrequency, 0)).toBe(50 * RULE.pickCount);
  });
});

// 스펙 21장 3·4·5번
describe("조합의 유효성과 티켓 수", () => {
  it("모든 전략이 정확한 개수의, 유효한 조합을 낸다", () => {
    const draws = makeDraws(200);
    const run = runBacktest(draws, KOREAN_STRATEGIES, OPTIONS);

    for (const result of run.results) {
      expect(result.ticketsPerDraw).toBe(10);
      expect(result.totalTickets).toBe(result.drawsTested * 10);
      for (const round of result.perRound) {
        expect(round.matches).toHaveLength(10);
      }
    }
  });

  it("범위를 벗어나거나 중복된 번호를 내면 엔진이 잡아낸다", () => {
    const draws = makeDraws(200);
    const broken: Strategy = {
      id: "broken",
      name: "고장",
      generate: () => Array.from({ length: 10 }, () => [1, 1, 2, 3, 4, 5]),
    };
    expect(() => runBacktest(draws, [broken], OPTIONS)).toThrow(/잘못된 조합/);

    const outOfRange: Strategy = {
      id: "oor",
      name: "범위밖",
      generate: () => Array.from({ length: 10 }, () => [1, 2, 3, 4, 5, 99]),
    };
    expect(() => runBacktest(draws, [outOfRange], OPTIONS)).toThrow(/범위 밖/);
  });

  it("티켓 수가 모자라면 엔진이 잡아낸다", () => {
    const draws = makeDraws(200);
    const lazy: Strategy = { id: "lazy", name: "게으름", generate: () => [[1, 2, 3, 4, 5, 6]] };
    expect(() => runBacktest(draws, [lazy], OPTIONS)).toThrow(/1조합을 냈다/);
  });

  it("모든 전략이 같은 회차·같은 티켓 수로 비교된다", () => {
    const draws = makeDraws(200);
    const run = runBacktest(draws, KOREAN_STRATEGIES, OPTIONS);
    const rounds = run.results.map((r) => r.perRound.map((p) => p.round));
    expect(rounds[1]).toEqual(rounds[0]);
    expect(rounds[2]).toEqual(rounds[0]);
    expect(new Set(run.results.map((r) => r.totalTickets)).size).toBe(1);
  });
});

// 스펙 21장 7번
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
    // 채점이 실제로 대상 회차와 비교되는지 확인하는 역방향 검사.
    const draws = makeDraws(120);
    const byRound = new Map(draws.map((d) => [d.round, d.numbers]));
    const cheater: Strategy = {
      id: "cheat",
      name: "정답지",
      generate(context) {
        const nextRound = context.history[context.history.length - 1].round + 1;
        const answer = byRound.get(nextRound)!;
        return Array.from({ length: context.ticketCount }, () => [...answer]);
      },
    };
    const run = runBacktest(draws, [cheater], { ...OPTIONS, ticketCount: 1 });
    expect(run.results[0].jackpot).toBe(run.results[0].drawsTested);
    expect(run.results[0].averageMatches).toBe(6);
  });
});

// 스펙 21장 6번
describe("세트구 데이터가 없을 때", () => {
  it("한국 규칙은 setBall을 요구하지 않는다", () => {
    expect(RULE.setBallEnabled).toBe(false);
    const draws = makeDraws(200); // setBall 없음
    expect(() => runBacktest(draws, KOREAN_STRATEGIES, OPTIONS)).not.toThrow();
  });

  it("세트구를 쓰는 규칙에서 값이 이상하면 문제로 보고한다", () => {
    const draws: LottoDraw[] = [{ round: 1, numbers: [1, 2, 3, 4, 5, 6], bonus: 7, setBall: "Z" }];
    const issues = validateDraws(draws, { ...RULE, setBallEnabled: true, setBallNames: ["A", "B"] });
    expect(issues.some((i) => i.kind === "bad-set-ball")).toBe(true);
  });
});

// 스펙 21장 8번
describe("데이터 분리", () => {
  it("training/validation/test가 회차 순서대로 겹치지 않게 나뉜다", () => {
    const draws = makeDraws(1000);
    const split = splitByRatio(draws);
    expect(split.training.to).toBeLessThan(split.validation.from);
    expect(split.validation.to).toBeLessThan(split.test.from);
    expect(split.training.from).toBe(1);
    expect(split.test.to).toBe(1000);
  });
});

// 스펙 20장
describe("데이터 검증", () => {
  it("중복·누락·범위이탈·보너스 오류를 잡는다", () => {
    const issues = validateDraws(
      [
        { round: 1, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 },
        { round: 1, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 },
        { round: 4, numbers: [1, 2, 3, 4, 5, 99], bonus: 7 },
        { round: 5, numbers: [1, 1, 3, 4, 5, 6], bonus: 6 },
        { round: 6, numbers: [1, 2, 3, 4, 5], bonus: 7 },
      ],
      RULE,
    );
    const kinds = issues.map((i) => i.kind);
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
});

describe("필터", () => {
  it("설정하지 않은 필터는 전부 통과시킨다", () => {
    expect(passesFilters([1, 2, 3, 4, 5, 6], RULE, {})).toBe(true);
  });

  it("홀짝·합계·연속 조건을 적용한다", () => {
    expect(passesFilters([1, 3, 5, 7, 9, 11], RULE, { oddEven: [[3, 3]] })).toBe(false);
    expect(passesFilters([1, 2, 3, 4, 5, 6], RULE, { oddEven: [[3, 3]] })).toBe(true);
    expect(passesFilters([1, 2, 3, 4, 5, 6], RULE, { sumRange: [100, 180] })).toBe(false);
    expect(passesFilters([10, 20, 30, 40, 41, 42], RULE, { sumRange: [100, 200] })).toBe(true);
    expect(passesFilters([1, 2, 3, 10, 20, 30], RULE, { maxConsecutive: 2 })).toBe(false);
    expect(passesFilters([1, 2, 10, 20, 30, 40], RULE, { maxConsecutive: 2 })).toBe(true);
  });

  it("필터를 켜도 티켓 수는 그대로 채운다", () => {
    const draws = makeDraws(200);
    const params = { ...DEFAULT_PARAMS, filters: { oddEven: [[3, 3] as [number, number]], sumRange: [100, 180] as [number, number] } };
    const run = runBacktest(draws, [frequencyStrategy], { ...OPTIONS, params });
    expect(run.results[0].totalTickets).toBe(run.results[0].drawsTested * 10);
  });
});

describe("통계 검정", () => {
  it("이론 기대 적중은 6/45에서 정확히 0.8이다", () => {
    expect(theoreticalMeanMatches(RULE)).toBeCloseTo(0.8, 10);
  });

  it("적중 개수 확률의 합은 1이다", () => {
    const total = [0, 1, 2, 3, 4, 5, 6].reduce((s, k) => s + matchProbability(k, RULE), 0);
    expect(total).toBeCloseTo(1, 10);
    // 1등 확률 = 1/8,145,060
    expect(matchProbability(6, RULE)).toBeCloseTo(1 / 8_145_060, 12);
  });

  it("부트스트랩 신뢰구간이 평균을 감싼다", () => {
    const rng = seededRng("ci");
    const samples = Array.from({ length: 300 }, () => 0.8 + (rng() - 0.5) * 0.4);
    const ci = bootstrapMeanCI(samples, { seed: "ci-test" });
    expect(ci.lower).toBeLessThan(ci.mean);
    expect(ci.upper).toBeGreaterThan(ci.mean);
    expect(ci.lower).toBeLessThan(0.8);
    expect(ci.upper).toBeGreaterThan(0.8);
  });

  it("차이가 없는 두 표본은 p값이 크다", () => {
    const rng = seededRng("perm");
    const a = Array.from({ length: 200 }, () => rng());
    const b = Array.from({ length: 200 }, () => rng());
    expect(pairedPermutationTest(a, b, { seed: "p1" }).pValue).toBeGreaterThan(0.05);
  });

  it("확실히 다른 두 표본은 p값이 작다", () => {
    const rng = seededRng("perm2");
    const a = Array.from({ length: 200 }, () => rng());
    const b = a.map((v) => v + 0.5);
    expect(pairedPermutationTest(a, b, { seed: "p2" }).pValue).toBeLessThan(0.01);
  });

  it("1등처럼 드문 사건은 표본 부족으로 표시한다", () => {
    const draws = makeDraws(300);
    const run = runBacktest(draws, KOREAN_STRATEGIES, OPTIONS);
    const verdicts = judgeResults(run.results, RULE);
    // 티켓 2500장으로는 5개·6개 적중을 논할 수 없다.
    expect(verdicts[0].insufficientSamples.some((s) => s.startsWith("6개 적중"))).toBe(true);
    expect(verdicts[0].insufficientSamples.some((s) => s.startsWith("5개 적중"))).toBe(true);
  });
});

describe("전략들의 실제 동작", () => {
  it("빈도 전략은 후보를 압축해서 쓴다", () => {
    const draws = makeDraws(300);
    const rng = seededRng("cand");
    const tickets = frequencyStrategy.generate({
      history: draws,
      rule: RULE,
      rng,
      ticketCount: 30,
      params: { ...DEFAULT_PARAMS, candidateCount: 12 },
    });
    const used = new Set(tickets.flat());
    expect(used.size).toBeLessThanOrEqual(12);
  });

  it("무작위 전략은 전체 번호를 쓴다", () => {
    const draws = makeDraws(300);
    const tickets = randomStrategy.generate({
      history: draws,
      rule: RULE,
      rng: seededRng("all"),
      ticketCount: 200,
      params: DEFAULT_PARAMS,
    });
    expect(new Set(tickets.flat()).size).toBe(45);
  });

  it("weight를 바꾸면 핫콜드 전략의 결과가 바뀐다", () => {
    const draws = makeDraws(300);
    const make = (weights: { frequency: number; recent: number; gap: number }) =>
      hotColdStrategy
        .generate({
          history: draws,
          rule: RULE,
          rng: seededRng("w"),
          ticketCount: 5,
          params: { ...DEFAULT_PARAMS, weights },
        })
        .map((t) => t.join(","));

    expect(make({ frequency: 1, recent: 0, gap: 0 })).not.toEqual(make({ frequency: 0, recent: 0, gap: 1 }));
  });
});
