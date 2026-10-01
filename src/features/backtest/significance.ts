// 전략 차이가 우연인지 판단하는 통계 도구 (스펙 15장).
//
// 평균만 보고 "이 전략이 더 낫다"고 말하지 않기 위한 파일이다. 표본이 부족해 판단할 수 없는
// 구간은 그렇다고 표시한다.

import type { BacktestResult, LottoRule, Rng } from "./types";
import { seededRng } from "./engine";

// ---------- 이론값 ----------

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/**
 * 무작위 조합 하나가 정확히 k개 맞을 확률(초기하분포).
 * 시뮬레이션이 아니라 계산으로 나오는 값이라 표본 오차가 없다 - 무작위 기준선으로 이것을 쓴다.
 */
export function matchProbability(k: number, rule: LottoRule): number {
  const { maxNumber, pickCount } = rule;
  return (
    (combinations(pickCount, k) * combinations(maxNumber - pickCount, pickCount - k)) /
    combinations(maxNumber, pickCount)
  );
}

/** 무작위 조합의 기대 적중 개수. 6/45면 정확히 6×6/45 = 0.8. */
export function theoreticalMeanMatches(rule: LottoRule): number {
  return (rule.pickCount * rule.pickCount) / rule.maxNumber;
}

// ---------- 부트스트랩 ----------

export interface ConfidenceInterval {
  mean: number;
  lower: number;
  upper: number;
  /** 신뢰수준. 0.95면 95%. */
  level: number;
}

/**
 * 회차별 평균 적중을 재표본해 평균의 신뢰구간을 구한다.
 *
 * 티켓 단위가 아니라 회차 단위로 재표본하는 것이 핵심이다. 한 회차의 티켓들은 모두 같은
 * 당첨번호로 채점되므로 서로 독립이 아니다. 티켓 단위로 재표본하면 표본 크기를 티켓 수만큼
 * 부풀려 신뢰구간이 실제보다 좁아지고, 없는 차이가 유의해 보인다.
 */
export function bootstrapMeanCI(
  roundMeans: readonly number[],
  options: { iterations?: number; level?: number; seed?: string } = {},
): ConfidenceInterval {
  const { iterations = 2000, level = 0.95, seed = "bootstrap" } = options;
  const n = roundMeans.length;
  const mean = roundMeans.reduce((s, v) => s + v, 0) / n;

  if (n < 2) {
    return { mean, lower: Number.NaN, upper: Number.NaN, level };
  }

  const rng = seededRng(seed);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += roundMeans[Math.floor(rng() * n)];
    }
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);

  const alpha = (1 - level) / 2;
  return {
    mean,
    lower: means[Math.floor(alpha * iterations)],
    upper: means[Math.min(iterations - 1, Math.floor((1 - alpha) * iterations))],
    level,
  };
}

// ---------- 순열검정 ----------

export interface PermutationTestResult {
  observedDifference: number;
  pValue: number;
  iterations: number;
}

/**
 * 같은 회차를 두 전략이 함께 테스트했으므로 짝지은 순열검정을 쓴다.
 * 회차마다 두 전략의 값을 무작위로 바꿔치기해 "차이가 없다"는 가정 아래의 분포를 만들고,
 * 실제 차이가 그 분포에서 얼마나 흔한지 본다.
 */
export function pairedPermutationTest(
  a: readonly number[],
  b: readonly number[],
  options: { iterations?: number; seed?: string } = {},
): PermutationTestResult {
  const { iterations = 5000, seed = "permutation" } = options;
  if (a.length !== b.length) throw new Error("짝지은 검정인데 길이가 다르다");

  const diffs = a.map((v, i) => v - b[i]);
  const observed = diffs.reduce((s, d) => s + d, 0) / diffs.length;

  const rng = seededRng(seed);
  let atLeastAsExtreme = 0;
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (const d of diffs) {
      sum += rng() < 0.5 ? d : -d;
    }
    if (Math.abs(sum / diffs.length) >= Math.abs(observed)) atLeastAsExtreme += 1;
  }

  // +1 보정: 관측값 자신도 귀무분포의 한 경우로 세어 p가 0으로 떨어지는 것을 막는다.
  return {
    observedDifference: observed,
    pValue: (atLeastAsExtreme + 1) / (iterations + 1),
    iterations,
  };
}

// ---------- 몬테카를로 ----------

export interface MonteCarloResult {
  /** 실제 관측된 횟수. 예: 4개 이상 적중 12회 */
  observed: number;
  /** 무작위로 같은 조건을 반복했을 때의 평균. */
  randomMean: number;
  /** 무작위 반복의 95% 범위. */
  randomRange: [number, number];
  /** 무작위가 관측값 이상을 낼 확률. 흔하면 그 결과는 우연으로 설명된다. */
  probabilityAtLeastObserved: number;
  iterations: number;
}

/**
 * 평균 lambda인 푸아송 표본 하나 (Knuth). 티켓을 한 장씩 던지는 대신 이것을 쓴다.
 *
 * 티켓 수가 수천~수만이고 성공 확률이 0.001 수준이라 이항분포가 푸아송에 사실상 일치한다.
 * 한 표본에 티켓 수만큼 난수를 쓰면(8,820 × 5,000회 = 4천만 번) 폰에서 수십 초 멈춘다.
 */
function poissonSample(lambda: number, rng: Rng): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let product = rng();
  while (product > limit) {
    k += 1;
    product *= rng();
  }
  return k;
}

/**
 * "4개 이상 적중 12회"처럼 개수로 나온 결과가 무작위에서도 흔한지 본다.
 *
 * 티켓 하나가 k개 이상 맞을 확률은 초기하분포로 정확히 계산되므로, 시뮬레이션은 그 확률을
 * 가진 동전을 티켓 수만큼 던지는 것과 같다.
 */
export function monteCarloAtLeast(
  observed: number,
  totalTickets: number,
  minMatches: number,
  rule: LottoRule,
  options: { iterations?: number; seed?: string } = {},
): MonteCarloResult {
  const { iterations = 5000, seed = "montecarlo" } = options;

  let p = 0;
  for (let k = minMatches; k <= rule.pickCount; k++) p += matchProbability(k, rule);

  const rng = seededRng(`${seed}|${minMatches}`);
  const lambda = totalTickets * p;
  const counts: number[] = [];
  let atLeastObserved = 0;

  for (let i = 0; i < iterations; i++) {
    const hits = poissonSample(lambda, rng);
    counts.push(hits);
    if (hits >= observed) atLeastObserved += 1;
  }

  counts.sort((a, b) => a - b);
  return {
    observed,
    randomMean: counts.reduce((s, c) => s + c, 0) / iterations,
    randomRange: [counts[Math.floor(0.025 * iterations)], counts[Math.floor(0.975 * iterations)]],
    probabilityAtLeastObserved: (atLeastObserved + 1) / (iterations + 1),
    iterations,
  };
}

// ---------- 해석 ----------

/** 무작위 기준선과 비교한 방향. "same"은 차이가 오차 범위 안이라는 뜻. */
export type RandomComparison = "above" | "below" | "same";

/** 적중 개수 한 칸. 관측 건수와 무작위 기대 건수를 같은 자리에 담아 둘이 섞이지 않게 한다. */
export interface MatchBreakdown {
  matches: number;
  /** 실제 발생 건수. */
  observed: number;
  /** 무작위였다면 나왔을 기대 건수. 정수가 아니다(예: 0.253건). */
  expected: number;
  /** 기대 건수가 너무 적어 관측값으로 아무 판단도 할 수 없는 칸. */
  insufficient: boolean;
}

export interface StrategyVerdict {
  strategyId: string;
  strategyName: string;
  observedMean: number;
  theoreticalMean: number;
  /** 관측 평균 - 이론 평균. 부호가 방향이다. */
  difference: number;
  ci: ConfidenceInterval;
  /**
   * 신뢰구간이 이론값을 포함하면 "same". 포함하지 않으면 벗어난 쪽.
   *
   * 방향이 없으면 안 된다. 평균이 기준선보다 낮아서 구간이 벗어난 경우에도 "차이 있음"만
   * 띄우면, 가장 나쁜 방법이 특별한 방법으로 읽힌다(실측: 출현 빈도 0.7717, 구간 상한 0.7997).
   */
  comparison: RandomComparison;
  /** 무작위 전략과의 짝지은 순열검정. 무작위 전략 자신이면 undefined. */
  vsRandom?: PermutationTestResult;
  /** 4개 이상 적중 건수가 무작위에서도 흔한지. "16 vs 12"를 개선으로 읽지 않게 하는 근거. */
  atLeast4: MonteCarloResult;
  /** 0개부터 pickCount개까지 전 구간. */
  breakdown: MatchBreakdown[];
}

/** 기대 발생 횟수가 이보다 적으면 관측값으로 아무 말도 할 수 없다고 본다. */
const MIN_EXPECTED_EVENTS = 5;

export function judgeResults(
  results: readonly BacktestResult[],
  rule: LottoRule,
  options: { randomStrategyId?: string; seed?: string } = {},
): StrategyVerdict[] {
  const { randomStrategyId = "random", seed = "judge" } = options;
  const theoretical = theoreticalMeanMatches(rule);
  const baseline = results.find((r) => r.strategyId === randomStrategyId);

  return results.map((result) => {
    const roundMeans = result.perRound.map((r) => r.averageMatch);
    const ci = bootstrapMeanCI(roundMeans, { seed: `${seed}|${result.strategyId}` });

    const breakdown: MatchBreakdown[] = [];
    for (let k = 0; k <= rule.pickCount; k++) {
      const expected = matchProbability(k, rule) * result.totalTickets;
      breakdown.push({
        matches: k,
        observed: result.matchCounts[k],
        expected,
        insufficient: expected < MIN_EXPECTED_EVENTS,
      });
    }

    let vsRandom: PermutationTestResult | undefined;
    if (baseline && baseline.strategyId !== result.strategyId) {
      vsRandom = pairedPermutationTest(
        roundMeans,
        baseline.perRound.map((r) => r.averageMatch),
        { seed: `${seed}|${result.strategyId}|vs-random` },
      );
    }

    let comparison: RandomComparison = "same";
    if (theoretical > ci.upper) comparison = "below";
    else if (theoretical < ci.lower) comparison = "above";

    return {
      strategyId: result.strategyId,
      strategyName: result.strategyName,
      observedMean: result.averageMatches,
      theoreticalMean: theoretical,
      difference: result.averageMatches - theoretical,
      ci,
      comparison,
      vsRandom,
      atLeast4: monteCarloAtLeast(result.atLeast4, result.totalTickets, 4, rule, {
        seed: `${seed}|${result.strategyId}`,
      }),
      breakdown,
    };
  });
}

/**
 * 화면에 그대로 띄우는 한 줄. p값이나 신뢰구간 숫자를 읽을 줄 몰라도 오해하지 않게,
 * 방향과 "유의한가"를 한 문장에서 같이 말한다. 평균 차이만 따로 띄우는 일이 없도록
 * 화면은 이 함수만 쓴다.
 */
export function verdictLabel(verdict: StrategyVerdict): string {
  const { difference, comparison, vsRandom } = verdict;
  const diff = `${difference >= 0 ? "+" : ""}${difference.toFixed(3)}개`;

  if (comparison === "same") return `무작위와 차이 없음 (${diff}, 오차 범위 안)`;
  if (comparison === "below") return `무작위보다 낮음 (${diff})`;

  const holds = vsRandom === undefined || vsRandom.pValue < 0.05;
  return holds
    ? `무작위보다 높음 (${diff}) — 다른 구간에서도 유지되는지 확인 필요`
    : `무작위보다 높아 보이지만 우연으로 설명됨 (${diff})`;
}
