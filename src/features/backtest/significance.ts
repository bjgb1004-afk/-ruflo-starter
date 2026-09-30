// 전략 차이가 우연인지 판단하는 통계 도구 (스펙 15장).
//
// 평균만 보고 "이 전략이 더 낫다"고 말하지 않기 위한 파일이다. 표본이 부족해 판단할 수 없는
// 구간은 그렇다고 표시한다.

import type { BacktestResult, LottoRule } from "./types";
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

// ---------- 해석 ----------

export interface StrategyVerdict {
  strategyId: string;
  strategyName: string;
  observedMean: number;
  theoreticalMean: number;
  ci: ConfidenceInterval;
  /** 신뢰구간이 이론적 무작위 평균을 포함하면 "차이 없음"이다. */
  differsFromRandom: boolean;
  /** 무작위 전략과의 짝지은 순열검정. 무작위 전략 자신이면 undefined. */
  vsRandom?: PermutationTestResult;
  /** 표본이 부족해 판단할 수 없는 항목들. */
  insufficientSamples: string[];
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

    const insufficientSamples: string[] = [];
    for (let k = rule.pickCount; k >= 3; k--) {
      const expected = matchProbability(k, rule) * result.totalTickets;
      if (expected < MIN_EXPECTED_EVENTS) {
        insufficientSamples.push(
          `${k}개 적중 (기대 ${expected.toFixed(3)}건 < ${MIN_EXPECTED_EVENTS}건, 관측 ${result.matchCounts[k]}건)`,
        );
      }
    }

    let vsRandom: PermutationTestResult | undefined;
    if (baseline && baseline.strategyId !== result.strategyId) {
      vsRandom = pairedPermutationTest(
        roundMeans,
        baseline.perRound.map((r) => r.averageMatch),
        { seed: `${seed}|${result.strategyId}|vs-random` },
      );
    }

    return {
      strategyId: result.strategyId,
      strategyName: result.strategyName,
      observedMean: result.averageMatches,
      theoreticalMean: theoretical,
      ci,
      differsFromRandom: theoretical < ci.lower || theoretical > ci.upper,
      vsRandom,
      insufficientSamples,
    };
  });
}
