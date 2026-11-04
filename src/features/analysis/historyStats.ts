// 과거 회차를 "읽기" 위한 집계. 백테스트 엔진(recipes.ts)이 점수 계산에 쓰는 통계와 달리
// 이 파일은 화면에 그대로 뿌릴 숫자를 만든다 - 번호를 고르지 않고, 판정하지 않는다.
//
// React를 import하지 않는다. 같은 코드가 화면·스크립트 어디서든 같은 숫자를 내야 한다.
import type { LottoDraw, LottoRule } from "@/features/backtest/types";

// ---------- 번호대(10단위) ----------
//
// 엔진의 6등분(sectorRanges)과 별개다. 사람들이 실제로 "1번대 2번대"로 나눠 보는 기준이
// 10단위라 화면에는 이걸 쓴다. 6등분은 가중치 계산에 그대로 남는다.
export const BAND_SIZE = 10;
export const BAND_COUNT = 5;

/** 번호가 속한 10단위 구간(0부터). 41~45는 마지막 구간에 함께 넣는다. */
export function bandIndexOf(n: number): number {
  return Math.min(Math.floor((n - 1) / BAND_SIZE), BAND_COUNT - 1);
}

export function bandLabel(i: number): string {
  const from = i * BAND_SIZE + 1;
  const to = i === BAND_COUNT - 1 ? 45 : (i + 1) * BAND_SIZE;
  return `${from}~${to}`;
}

// ---------- 동반 출현 ----------

/**
 * 번호 쌍이 함께 나온 횟수. [a][b]와 [b][a]가 같은 값이고 [n][n]은 0이다.
 * 1,243회차 × 15쌍 = 18,645번 더하기라 즉시 끝난다.
 */
export function pairCounts(draws: readonly LottoDraw[], rule: LottoRule): number[][] {
  const size = rule.maxNumber + 1;
  const counts = Array.from({ length: size }, () => new Array<number>(size).fill(0));

  for (const draw of draws) {
    const nums = draw.numbers;
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const a = nums[i];
        const b = nums[j];
        if (a < 1 || b < 1 || a > rule.maxNumber || b > rule.maxNumber || a === b) continue;
        counts[a][b] += 1;
        counts[b][a] += 1;
      }
    }
  }

  return counts;
}

/** n번과 함께 많이 나온 번호 상위 limit개. 동률은 번호가 작은 쪽을 먼저. */
export function topPartners(
  pairs: number[][],
  n: number,
  limit: number,
): { number: number; count: number }[] {
  const row = pairs[n] ?? [];
  return row
    .map((count, number) => ({ number, count }))
    .filter((p) => p.number >= 1 && p.number !== n && p.count > 0)
    .sort((a, b) => b.count - a.count || a.number - b.number)
    .slice(0, limit);
}

// ---------- 출현 간격 ----------

export interface NumberGapStats {
  number: number;
  /** 당첨번호 6개로 나온 횟수. 보너스는 세지 않는다. */
  appearances: number;
  /** 마지막으로 나온 회차. 한 번도 안 나왔으면 null. */
  lastRound: number | null;
  /** 마지막 출현 이후 지난 회차 수. 마지막 회차에 나왔으면 0. */
  roundsSince: number | null;
  /** 출현 간격(회차 수)의 평균/최소/최대. 두 번 이상 나오지 않았으면 null. */
  meanGap: number | null;
  minGap: number | null;
  maxGap: number | null;
}

/**
 * 번호별 출현 간격. 간격은 회차 번호의 차이가 아니라 데이터상 몇 회차 뒤에 다시 나왔는지다
 * (빠진 회차가 있어도 "몇 번째 추첨 뒤"라는 뜻이 유지된다).
 */
export function gapStats(draws: readonly LottoDraw[], rule: LottoRule): NumberGapStats[] {
  const sorted = [...draws].sort((a, b) => a.round - b.round);
  const positions = new Map<number, number[]>();

  sorted.forEach((draw, index) => {
    for (const n of draw.numbers) {
      if (n < 1 || n > rule.maxNumber) continue;
      const list = positions.get(n);
      if (list) list.push(index);
      else positions.set(n, [index]);
    }
  });

  const lastIndex = sorted.length - 1;

  return Array.from({ length: rule.maxNumber }, (_, i) => {
    const number = i + 1;
    const at = positions.get(number) ?? [];
    if (at.length === 0) {
      return {
        number,
        appearances: 0,
        lastRound: null,
        roundsSince: null,
        meanGap: null,
        minGap: null,
        maxGap: null,
      };
    }

    const gaps: number[] = [];
    for (let k = 1; k < at.length; k++) gaps.push(at[k] - at[k - 1]);
    const last = at[at.length - 1];

    return {
      number,
      appearances: at.length,
      lastRound: sorted[last].round,
      roundsSince: lastIndex - last,
      meanGap: gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null,
      minGap: gaps.length ? Math.min(...gaps) : null,
      maxGap: gaps.length ? Math.max(...gaps) : null,
    };
  });
}

// ---------- 조합 특성 ----------

export interface DrawShape {
  sum: number;
  /** 홀수 개수. 짝수 개수는 pickCount - odd. */
  odd: number;
  /** 저번호(1 ~ maxNumber/2) 개수. */
  low: number;
  /** 10단위 구간별 개수. 길이 BAND_COUNT. */
  bands: number[];
  /** 가장 긴 연속 번호의 길이. 1이면 연속이 없다(엔진 filters.maxConsecutive와 같은 뜻). */
  maxConsecutive: number;
  /** 같은 끝수가 가장 많이 겹친 개수. 1이면 겹침이 없다. */
  maxSameEnding: number;
  /** 직전 회차와 겹친 개수. 직전 회차를 안 주면 null. */
  carryOver: number | null;
}

export function shapeOf(draw: LottoDraw, rule: LottoRule, previous?: LottoDraw): DrawShape {
  const sorted = [...draw.numbers].sort((a, b) => a - b);
  const half = rule.maxNumber / 2;

  const bands = new Array<number>(BAND_COUNT).fill(0);
  for (const n of sorted) bands[bandIndexOf(n)] += 1;

  let run = 1;
  let maxConsecutive = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] - sorted[i - 1] === 1 ? run + 1 : 1;
    if (run > maxConsecutive) maxConsecutive = run;
  }

  const endings = new Array<number>(10).fill(0);
  for (const n of sorted) endings[n % 10] += 1;

  const prevSet = previous ? new Set(previous.numbers) : null;

  return {
    sum: sorted.reduce((s, n) => s + n, 0),
    odd: sorted.filter((n) => n % 2 === 1).length,
    low: sorted.filter((n) => n <= half).length,
    bands,
    maxConsecutive,
    maxSameEnding: Math.max(...endings),
    carryOver: prevSet ? sorted.filter((n) => prevSet.has(n)).length : null,
  };
}

export interface SumBucket {
  from: number;
  to: number;
  count: number;
}

export interface ShapeDistribution {
  count: number;
  sumMean: number;
  sumMin: number;
  sumMax: number;
  /** 10 단위 칸. 6/45의 가능한 합계는 21~255다. */
  sumHistogram: SumBucket[];
  /** 홀수 개수별 회차 수. 길이 pickCount+1. */
  oddCounts: number[];
  /** 저번호 개수별 회차 수. 길이 pickCount+1. */
  lowCounts: number[];
  /** 10단위 구간별 번호 출현 합계. 길이 BAND_COUNT. */
  bandTotals: number[];
  /** 가장 긴 연속 길이별 회차 수. 길이 pickCount+1 (index 0은 안 쓴다). */
  consecutiveCounts: number[];
  /** 같은 끝수 최대 겹침별 회차 수. 길이 pickCount+1 (index 0은 안 쓴다). */
  sameEndingCounts: number[];
  /** 이월수별 회차 수. 첫 회차는 직전이 없어 세지 않는다. 길이 pickCount+1. */
  carryOverCounts: number[];
}

const SUM_BUCKET = 10;

export function shapeDistribution(draws: readonly LottoDraw[], rule: LottoRule): ShapeDistribution {
  const sorted = [...draws].sort((a, b) => a.round - b.round);
  const shapes = sorted.map((d, i) => shapeOf(d, rule, i > 0 ? sorted[i - 1] : undefined));

  const oddCounts = new Array<number>(rule.pickCount + 1).fill(0);
  const lowCounts = new Array<number>(rule.pickCount + 1).fill(0);
  const consecutiveCounts = new Array<number>(rule.pickCount + 1).fill(0);
  const sameEndingCounts = new Array<number>(rule.pickCount + 1).fill(0);
  const carryOverCounts = new Array<number>(rule.pickCount + 1).fill(0);
  const bandTotals = new Array<number>(BAND_COUNT).fill(0);

  const minPossible = (rule.pickCount * (rule.pickCount + 1)) / 2;
  const maxPossible = (rule.pickCount * (2 * rule.maxNumber - rule.pickCount + 1)) / 2;
  const first = Math.floor(minPossible / SUM_BUCKET) * SUM_BUCKET;
  const buckets: SumBucket[] = [];
  for (let from = first; from <= maxPossible; from += SUM_BUCKET) {
    buckets.push({ from, to: from + SUM_BUCKET - 1, count: 0 });
  }

  let sumTotal = 0;
  let sumMin = Number.POSITIVE_INFINITY;
  let sumMax = Number.NEGATIVE_INFINITY;

  for (const s of shapes) {
    sumTotal += s.sum;
    if (s.sum < sumMin) sumMin = s.sum;
    if (s.sum > sumMax) sumMax = s.sum;
    oddCounts[s.odd] += 1;
    lowCounts[s.low] += 1;
    consecutiveCounts[Math.min(s.maxConsecutive, rule.pickCount)] += 1;
    sameEndingCounts[Math.min(s.maxSameEnding, rule.pickCount)] += 1;
    if (s.carryOver !== null) carryOverCounts[s.carryOver] += 1;
    s.bands.forEach((c, i) => (bandTotals[i] += c));
    const bucket = buckets[Math.floor((s.sum - first) / SUM_BUCKET)];
    if (bucket) bucket.count += 1;
  }

  return {
    count: shapes.length,
    sumMean: shapes.length ? sumTotal / shapes.length : 0,
    sumMin: shapes.length ? sumMin : 0,
    sumMax: shapes.length ? sumMax : 0,
    sumHistogram: buckets,
    oddCounts,
    lowCounts,
    bandTotals,
    consecutiveCounts,
    sameEndingCounts,
    carryOverCounts,
  };
}
