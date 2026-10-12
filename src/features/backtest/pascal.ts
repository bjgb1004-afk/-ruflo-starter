// 조합을 세는 쪽 - 파스칼의 삼각형(이항계수)과 초기하분포.
//
// 이 파일은 번호를 고르지 않는다. "그 조건을 만족하는 조합이 몇 개인가", "후보 N개를 남겼을 때
// 당첨번호가 그 안에 몇 개 들어오는 것이 정상인가"를 계산한다. 분석법이 잘한 것인지 판단할
// 기준선이 없으면, 후보 15개에 2개가 들어온 것을 성과로 착각하게 된다(무작위 15개의 기대값이
// 정확히 2개다).
//
// 다른 backtest 파일과 같이 React/Expo를 import하지 않는 순수 TypeScript다.

import type { FilterConfig, LottoDraw, LottoRule, Recipe } from "./types";
import { analyzeWithRecipe, passesFilters } from "./recipes";

// ---------- 이항계수 ----------

/** C(n, k). 파스칼 삼각형의 한 칸. */
export function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/** 전체 조합 수. 6/45면 8,145,060. */
export function totalCombinations(rule: LottoRule): number {
  return combinations(rule.maxNumber, rule.pickCount);
}

// ---------- 후보 압축의 기대 성능 (초기하분포) ----------

/**
 * 후보 candidateCount개를 남겼을 때, 당첨번호 pickCount개 중 정확히 k개가 그 안에 들어올 확률.
 * P(X=k) = C(후보, k) × C(나머지, 뽑는 수 - k) / C(전체, 뽑는 수)
 */
export function candidateHitProbability(k: number, candidateCount: number, rule: LottoRule): number {
  const { maxNumber, pickCount } = rule;
  return (
    (combinations(candidateCount, k) * combinations(maxNumber - candidateCount, pickCount - k)) /
    combinations(maxNumber, pickCount)
  );
}

/** 무작위로 후보를 골랐을 때의 기대 적중 개수. 45에서 15개를 남기면 정확히 2개. */
export function expectedCandidateHits(candidateCount: number, rule: LottoRule): number {
  return (rule.pickCount * candidateCount) / rule.maxNumber;
}

/** 후보 안에 당첨번호가 minHits개 이상 들어올 확률. */
export function candidateHitProbabilityAtLeast(minHits: number, candidateCount: number, rule: LottoRule): number {
  let p = 0;
  for (let k = minHits; k <= rule.pickCount; k++) p += candidateHitProbability(k, candidateCount, rule);
  return p;
}

// ---------- 모양별 조합 수 ----------

/**
 * 홀짝·저고·합계 조건을 동시에 만족하는 조합이 몇 개인지 정확히 센다.
 *
 * 8,145,060개를 전부 만들지 않고, 번호를 1부터 하나씩 더해가며 (뽑은 개수, 합계, 홀수 개수,
 * 저번호 개수)별 조합 수를 누적한다 - 위 두 칸을 더해 아래 칸을 만드는 파스칼 삼각형과 같은
 * 셈이다. 연속번호·끝수 같은 "번호 사이 관계" 조건은 이 셈으로 표현할 수 없어 세지 않는다
 * (그 조건까지 켜면 실제 통과 조합은 이 값보다 적다 - 화면에서 그렇게 말해야 한다).
 */
export function countCombinationsByShape(
  rule: LottoRule,
  filters: Pick<FilterConfig, "oddEven" | "lowHigh" | "sumRange">,
): number {
  const { maxNumber, pickCount } = rule;
  const lowMax = Math.floor(maxNumber / 2);
  const maxSum = filters.sumRange ? filters.sumRange[1] : pickCount * maxNumber;
  const minSum = filters.sumRange ? filters.sumRange[0] : 0;

  // counts[뽑은 개수][합계][홀수 개수][저번호 개수]
  const index = (picked: number, sum: number, odd: number, low: number) =>
    ((picked * (maxSum + 1) + sum) * (pickCount + 1) + odd) * (pickCount + 1) + low;
  const size = (pickCount + 1) * (maxSum + 1) * (pickCount + 1) * (pickCount + 1);
  const counts = new Float64Array(size);
  counts[index(0, 0, 0, 0)] = 1;

  for (let n = 1; n <= maxNumber; n++) {
    const isOdd = n % 2 === 1 ? 1 : 0;
    const isLow = n <= lowMax ? 1 : 0;
    // 큰 쪽부터 내려가며 갱신하면 같은 번호를 두 번 쓰지 않는다.
    for (let picked = pickCount - 1; picked >= 0; picked--) {
      for (let sum = maxSum - n; sum >= 0; sum--) {
        for (let odd = picked; odd >= 0; odd--) {
          for (let low = picked; low >= 0; low--) {
            const from = counts[index(picked, sum, odd, low)];
            if (from === 0) continue;
            counts[index(picked + 1, sum + n, odd + isOdd, low + isLow)] += from;
          }
        }
      }
    }
  }

  let total = 0;
  for (let sum = minSum; sum <= maxSum; sum++) {
    for (let odd = 0; odd <= pickCount; odd++) {
      if (filters.oddEven && !filters.oddEven.some(([o, e]) => o === odd && e === pickCount - odd)) continue;
      for (let low = 0; low <= pickCount; low++) {
        if (filters.lowHigh && !filters.lowHigh.some(([l, h]) => l === low && h === pickCount - low)) continue;
        total += counts[index(pickCount, sum, odd, low)];
      }
    }
  }
  return total;
}

// ---------- 후보 압축 실측 ----------

export interface CandidateHitsResult {
  /** 몇 회차를 재봤는지. */
  rounds: number;
  /** 후보 수(레시피의 candidateCount). */
  candidateCount: number;
  /** 회차마다 "당첨번호 6개 중 후보에 들어있던 개수"의 평균. */
  meanHits: number;
  /** 무작위로 같은 개수를 남겼을 때의 기대값. 45에서 15개면 2.00. */
  expectedHits: number;
  /** hitCounts[k] = k개 들어온 회차 수. 길이는 pickCount + 1. */
  hitCounts: number[];
  /** 3개 이상 들어온 회차 비율. */
  atLeast3Ratio: number;
  /** 무작위였다면 3개 이상이 나올 비율(이론값). */
  expectedAtLeast3Ratio: number;
}

/**
 * 지난 회차를 되짚어 "그 회차 전까지의 데이터로 뽑은 후보 안에 당첨번호가 몇 개 들어있었나"를 센다.
 *
 * 각 회차의 후보는 그 회차 이전 history만으로 만든다 - 백테스트 엔진과 같은 누수 차단선이다.
 * 마지막 rounds회만 재보는 것은 폰에서 즉시 끝내기 위한 것이며, 회차 수는 결과에 그대로 담아
 * 화면이 "최근 N회 기준"이라고 말할 수 있게 한다.
 */
export function measureCandidateHits(
  recipe: Recipe,
  draws: readonly LottoDraw[],
  rule: LottoRule,
  options: { rounds?: number; minimumHistory?: number } = {},
): CandidateHitsResult | null {
  const { rounds = 100, minimumHistory = 100 } = options;
  const sorted = [...draws].sort((a, b) => a.round - b.round);
  const start = Math.max(minimumHistory, sorted.length - rounds);
  if (start >= sorted.length) return null;

  const candidateCount = Math.min(recipe.candidateCount, rule.maxNumber);
  const hitCounts = new Array<number>(rule.pickCount + 1).fill(0);
  let hitSum = 0;
  let tested = 0;

  for (let i = start; i < sorted.length; i++) {
    const target = sorted[i];
    const { candidates } = analyzeWithRecipe(recipe, sorted.slice(0, i), rule, target.round);
    const inside = new Set(candidates.map((c) => c.number));
    const hits = target.numbers.filter((n) => inside.has(n)).length;
    hitCounts[hits] += 1;
    hitSum += hits;
    tested += 1;
  }

  return {
    rounds: tested,
    candidateCount,
    meanHits: hitSum / tested,
    expectedHits: expectedCandidateHits(candidateCount, rule),
    hitCounts,
    atLeast3Ratio: hitCounts.slice(3).reduce((s, c) => s + c, 0) / tested,
    expectedAtLeast3Ratio: candidateHitProbabilityAtLeast(3, candidateCount, rule),
  };
}

/**
 * 후보에서 만들 수 있는 조합 중 레시피 필터를 통과하는 개수. 후보가 적을 때만 쓴다
 * (C(15,6) = 5,005개라 전수로 세도 즉시 끝난다).
 */
export function countPassingCombinations(
  candidateNumbers: readonly number[],
  rule: LottoRule,
  filters: FilterConfig,
): number {
  const n = candidateNumbers.length;
  const k = rule.pickCount;
  if (n < k) return 0;

  const sorted = [...candidateNumbers].sort((a, b) => a - b);
  const indices = Array.from({ length: k }, (_, i) => i);
  let passing = 0;

  for (;;) {
    if (passesFilters(indices.map((i) => sorted[i]), rule, filters)) passing += 1;
    let pos = k - 1;
    while (pos >= 0 && indices[pos] === n - k + pos) pos -= 1;
    if (pos < 0) break;
    indices[pos] += 1;
    for (let i = pos + 1; i < k; i++) indices[i] = indices[i - 1] + 1;
  }

  return passing;
}
