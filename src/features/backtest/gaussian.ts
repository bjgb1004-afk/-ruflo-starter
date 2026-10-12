// 정규분포 쪽 - 합계가 평균에서 얼마나 떨어졌는지, 번호별 출현 횟수가 기대치에서 얼마나
// 벗어났는지를 표준편차 단위로 잰다.
//
// 여기 있는 것은 전부 "퍼짐을 재는 자"다. 자로 재는 것이 확률을 바꾸지는 않는다 - 합계가
// 평균에 가까운 조합이 1등 확률이 높은 것이 아니다. 중심부 합계는 그 합계를 만드는 조합이
// 많을 뿐이고, 조합 하나하나의 확률은 모두 1/8,145,060으로 같다.
//
// 다른 backtest 파일과 같이 React/Expo를 import하지 않는 순수 TypeScript다.

import type { LottoDraw, LottoRule } from "./types";

// ---------- 합계의 이론값 ----------

/** 1~N에서 서로 다른 k개를 뽑을 때 합계의 기대값. 6/45면 6 × 23 = 138. */
export function theoreticalSumMean(rule: LottoRule): number {
  return (rule.pickCount * (rule.maxNumber + 1)) / 2;
}

/**
 * 같은 조건에서 합계의 표준편차. 복원 없이 뽑으므로 유한모집단 보정이 들어간다.
 * σ = √( k(N−k)(N+1) / 12 ). 6/45면 약 29.95.
 */
export function theoreticalSumSd(rule: LottoRule): number {
  const { maxNumber: n, pickCount: k } = rule;
  return Math.sqrt((k * (n - k) * (n + 1)) / 12);
}

/** 합계 S의 표준점수. 138이면 0, 168이면 약 +1.00. */
export function sumZScore(sum: number, rule: LottoRule): number {
  return (sum - theoreticalSumMean(rule)) / theoreticalSumSd(rule);
}

/** 평균 ±z표준편차에 해당하는 합계 구간. 정수로 안쪽으로 자른다(필터에 그대로 넣는 값). */
export function sumRangeForZ(z: number, rule: LottoRule): [number, number] {
  const mean = theoreticalSumMean(rule);
  const sd = theoreticalSumSd(rule);
  return [Math.ceil(mean - z * sd), Math.floor(mean + z * sd)];
}

// ---------- 과거 합계의 실측 분포 ----------

export interface SumDistribution {
  rounds: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  /** 이론 평균·표준편차. 실측과 나란히 두고 본다. */
  theoreticalMean: number;
  theoreticalSd: number;
  /** 평균 ±1σ 안에 들어온 회차 비율. 정규분포라면 약 0.68. */
  withinOneSd: number;
}

/** 과거 회차 당첨번호 합계의 실측 분포. 이론값과 비교해 보여주는 데 쓴다. */
export function sumDistribution(draws: readonly LottoDraw[], rule: LottoRule): SumDistribution | null {
  if (draws.length === 0) return null;

  const sums = draws.map((d) => d.numbers.reduce((s, n) => s + n, 0));
  const mean = sums.reduce((s, v) => s + v, 0) / sums.length;
  // 표본표준편차(n−1). 회차는 전체가 아니라 지금까지 나온 표본이다.
  const variance =
    sums.length > 1 ? sums.reduce((s, v) => s + (v - mean) ** 2, 0) / (sums.length - 1) : 0;
  const sd = Math.sqrt(variance);

  const tMean = theoreticalSumMean(rule);
  const tSd = theoreticalSumSd(rule);
  const within = sums.filter((v) => Math.abs(v - tMean) <= tSd).length / sums.length;

  return {
    rounds: sums.length,
    mean,
    sd,
    min: Math.min(...sums),
    max: Math.max(...sums),
    theoreticalMean: tMean,
    theoreticalSd: tSd,
    withinOneSd: within,
  };
}

// ---------- 번호별 출현 횟수의 표준점수 ----------

/**
 * 번호 하나가 history회차 동안 나온 횟수의 표준점수.
 *
 * 한 회차에서 그 번호가 뽑힐 확률은 k/N(6/45)이므로, 기대 횟수는 rounds × k/N이고
 * 표준편차는 √(rounds × p(1−p))다. z가 ±2를 넘는 번호는 "표본 변동으로 설명하기 어려운
 * 쪽"이지만, 1,245회 × 45번호를 보면 그런 번호가 몇 개쯤 나오는 것이 정상이다 - 많이 나온
 * 번호를 특별하게 읽지 않기 위한 자다.
 */
export function frequencyZScore(observed: number, rounds: number, rule: LottoRule): number {
  if (rounds <= 0) return 0;
  const p = rule.pickCount / rule.maxNumber;
  const expected = rounds * p;
  const sd = Math.sqrt(rounds * p * (1 - p));
  return sd === 0 ? 0 : (observed - expected) / sd;
}
