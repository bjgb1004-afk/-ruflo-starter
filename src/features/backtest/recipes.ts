// 레시피 = 유저가 조합한 분석법. 요소별 가중치 + 후보 압축 + 필터 + 조합 방식.
//
// 전략 파일을 방식마다 따로 만들지 않고 레시피 하나를 전략으로 바꿔 쓴다. 프리셋 전부가
// 같은 코드의 설정 차이일 뿐이라, 유저가 만든 조합도 프리셋과 정확히 같은 조건에서 비교된다.

import type {
  FilterConfig,
  GroupingConfig,
  LottoDraw,
  LottoRule,
  Recipe,
  RecipeWeights,
  Rng,
  Strategy,
  StrategyContext,
} from "./types";
import { KOREA_LOTTO_6_45, MAX_ENUMERABLE_CANDIDATES, ZERO_WEIGHTS } from "./types";
import { frequencyZScore, sumRangeForZ } from "./gaussian";

// ---------- 회차주기 그룹 ----------

export const GROUP_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

/** 회차가 속한 그룹 번호. 당첨번호를 보지 않고 회차 번호만으로 정해지므로 미래 정보가 아니다. */
export function groupOf(round: number, grouping: GroupingConfig): number {
  return ((round % grouping.groupCount) + grouping.groupCount) % grouping.groupCount;
}

export function groupLabel(index: number): string {
  return GROUP_LABELS[index] ?? `G${index + 1}`;
}

// ---------- 구간(6등분) ----------

/** 번호 전체를 몇 구간으로 나눌지. 45개면 1-7 / 8-15 / 16-22 / 23-30 / 31-37 / 38-45. */
export const SECTOR_COUNT = 6;

/** 구간의 [시작, 끝] 목록. 둘 다 포함. */
export function sectorRanges(maxNumber: number): [number, number][] {
  const edges = Array.from({ length: SECTOR_COUNT + 1 }, (_, i) => Math.floor((maxNumber * i) / SECTOR_COUNT));
  return Array.from({ length: SECTOR_COUNT }, (_, i) => [edges[i] + 1, edges[i + 1]]);
}

/** 번호가 속한 구간 번호(0부터). 범위를 벗어나면 -1. */
export function sectorIndexOf(n: number, maxNumber: number): number {
  if (n < 1 || n > maxNumber) return -1;
  return sectorRanges(maxNumber).findIndex(([lo, hi]) => n >= lo && n <= hi);
}

// ---------- 피보나치 ----------

/** 범위 안의 피보나치 수. 45면 1, 2, 3, 5, 8, 13, 21, 34. */
export function fibonacciNumbers(maxNumber: number): number[] {
  const out: number[] = [];
  let a = 1;
  let b = 2;
  while (a <= maxNumber) {
    out.push(a);
    [a, b] = [b, a + b];
  }
  return out;
}

/**
 * 피보나치 수에 얼마나 가까운지. 수열 번호 자체는 1, 한 칸 떨어지면 1/2, 두 칸이면 1/3…
 * 수열의 8개만 쓰면 후보가 너무 좁아지므로 "주변"까지 점수를 주는 것이다(방법 A의 보완).
 */
export function fibonacciAffinity(n: number, maxNumber: number): number {
  const distance = Math.min(...fibonacciNumbers(maxNumber).map((f) => Math.abs(n - f)));
  return 1 / (1 + distance);
}

/** 정렬한 번호의 인접 간격 중 피보나치 수인 것의 개수. 6개면 간격은 5개다. */
export function fibonacciGapCount(numbers: readonly number[], maxNumber: number): number {
  const fibs = new Set(fibonacciNumbers(maxNumber));
  const sorted = [...numbers].sort((a, b) => a - b);
  let count = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (fibs.has(sorted[i] - sorted[i - 1])) count += 1;
  }
  return count;
}

// ---------- 오일러 (모듈러 / 정수론) ----------

/** 번호를 나머지로 묶을 때 쓰는 나눔수. 45를 5로 나누면 아홉 개씩 다섯 그룹이다. */
export const MOD_GROUP_DIVISOR = 5;

/** 번호가 속한 나머지 그룹(0 … MOD_GROUP_DIVISOR-1). */
export function modGroupOf(n: number): number {
  return n % MOD_GROUP_DIVISOR;
}

/** 오일러 파이 함수 φ(n) - n 이하에서 n과 서로소인 수의 개수. φ(1)=1. */
export function eulerTotient(n: number): number {
  let remaining = n;
  let result = n;
  for (let p = 2; p * p <= remaining; p++) {
    if (remaining % p !== 0) continue;
    while (remaining % p === 0) remaining /= p;
    result -= result / p;
  }
  if (remaining > 1) result -= result / remaining;
  return Math.round(result);
}

/**
 * φ(n)/n - 그 번호가 "서로소를 많이 가진 수"인 정도. 소수는 1에 가깝고 2·3·5로 잘 나뉘는
 * 수(30 등)는 낮다. 번호 자체로 정해지는 값이며 추첨과는 아무 관계가 없다.
 */
export function totientRatio(n: number): number {
  return eulerTotient(n) / n;
}

// ---------- 숫자별 통계 ----------

export interface NumberStats {
  number: number;
  totalFrequency: number;
  recentFrequency: number;
  /** 마지막 출현 이후 지난 회차 수. 한 번도 안 나왔으면 history 길이. */
  gap: number;
  /**
   * 최근 구간에서 이 번호가 속한 구간이 기대치보다 덜 나온 양(회). 양수면 덜 나온 것,
   * 음수면 더 나온 것. 같은 구간의 번호는 값이 같다.
   */
  sectorDeficit: number;
  /** 같은 계산을 나머지 그룹(n mod 5)으로 한 값. 구간이 아니라 나머지로 묶는다. */
  modGroupDeficit: number;
  /** 피보나치 수와의 가까움(0~1). 과거 데이터와 무관하게 번호 자체로 정해진다. */
  fibonacciAffinity: number;
  /** φ(n)/n. 과거 데이터와 무관하게 번호 자체로 정해진다. */
  totientRatio: number;
  /**
   * 출현 횟수의 표준점수 z. 0이면 이론 기대치만큼 나온 것, +면 더, −면 덜 나온 것.
   * 많이/적게가 아니라 "기대치에서 몇 표준편차 떨어졌나"를 보는 값이다.
   */
  frequencyZ: number;
  /** 대상 회차와 같은 그룹이었던 과거 회차에서의 출현 횟수. */
  groupFrequency: number;
  /** 같은 그룹 회차들만 놓고 셌을 때의 미출현 기간. */
  groupGap: number;
}

/**
 * history(대상 회차 이전까지)만 보고 숫자별 통계를 만든다.
 * targetGroup을 주면 같은 그룹이었던 과거 회차만 따로 세어 그룹 통계도 채운다.
 */
export function computeNumberStats(
  history: readonly LottoDraw[],
  rule: LottoRule,
  recentWindow: number,
  grouping?: GroupingConfig,
  targetGroup?: number,
): NumberStats[] {
  const stats: NumberStats[] = Array.from({ length: rule.maxNumber }, (_, i) => ({
    number: i + 1,
    totalFrequency: 0,
    recentFrequency: 0,
    gap: history.length,
    sectorDeficit: 0,
    modGroupDeficit: 0,
    fibonacciAffinity: fibonacciAffinity(i + 1, rule.maxNumber),
    totientRatio: totientRatio(i + 1),
    frequencyZ: 0,
    groupFrequency: 0,
    groupGap: 0,
  }));

  const sectorRecent = new Array<number>(SECTOR_COUNT).fill(0);
  const modRecent = new Array<number>(MOD_GROUP_DIVISOR).fill(0);
  let groupDrawsSeen = 0;
  const groupDrawCount = grouping
    ? history.filter((d) => groupOf(d.round, grouping) === targetGroup).length
    : 0;
  for (const s of stats) s.groupGap = groupDrawCount;

  for (let i = 0; i < history.length; i++) {
    const draw = history[i];
    const fromEnd = history.length - 1 - i; // 0이면 가장 최근 회차
    const inGroup = grouping !== undefined && groupOf(draw.round, grouping) === targetGroup;
    if (inGroup) groupDrawsSeen += 1;

    for (const n of draw.numbers) {
      const s = stats[n - 1];
      if (!s) continue;
      s.totalFrequency += 1;
      s.gap = fromEnd;
      if (fromEnd < recentWindow) {
        s.recentFrequency += 1;
        const sector = sectorIndexOf(n, rule.maxNumber);
        if (sector >= 0) sectorRecent[sector] += 1;
        modRecent[modGroupOf(n)] += 1;
      }
      if (inGroup) {
        s.groupFrequency += 1;
        s.groupGap = groupDrawCount - groupDrawsSeen;
      }
    }
  }

  // 그룹 균형: 최근 구간에서 "그룹 크기만큼 나왔어야 하는 양" 대비 실제로 덜 나온 양.
  // 그룹마다 크기가 다를 수 있으므로(구간은 7개/8개, 나머지 그룹은 9개씩) 개수를 그대로
  // 비교하지 않고 기대치와 비교한다. 구간이든 나머지든 셈은 같아 한 함수로 처리한다.
  const recentDraws = Math.min(history.length, recentWindow);
  const assignDeficit = (
    groupIndexOf: (n: number) => number,
    recentCounts: readonly number[],
    assign: (s: NumberStats, deficit: number) => void,
  ) => {
    const groupSize = new Array<number>(recentCounts.length).fill(0);
    for (let n = 1; n <= rule.maxNumber; n++) {
      const g = groupIndexOf(n);
      if (g >= 0) groupSize[g] += 1;
    }
    for (const s of stats) {
      const g = groupIndexOf(s.number);
      if (g < 0) continue;
      const expected = (recentDraws * rule.pickCount * groupSize[g]) / rule.maxNumber;
      assign(s, expected - recentCounts[g]);
    }
  };

  assignDeficit(
    (n) => sectorIndexOf(n, rule.maxNumber),
    sectorRecent,
    (s, d) => {
      s.sectorDeficit = d;
    },
  );
  assignDeficit(modGroupOf, modRecent, (s, d) => {
    s.modGroupDeficit = d;
  });

  // 출현 횟수의 표준점수. 전체 기간 기준이다 - 표본이 클수록 "많이 나왔다"를 변동으로
  // 설명할 수 있는지 판단할 수 있다.
  for (const s of stats) {
    s.frequencyZ = frequencyZScore(s.totalFrequency, history.length, rule);
  }

  return stats;
}

/** 0~1로 정규화. 전부 같은 값이면 0.5로 둔다(점수 차가 없다는 뜻). */
function normalize(values: readonly number[]): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

export interface ScoredNumber {
  number: number;
  score: number;
}

/** 가중치대로 요소들을 섞어 숫자별 점수를 만든다. */
export function scoreNumbers(stats: readonly NumberStats[], weights: RecipeWeights): ScoredNumber[] {
  const parts: [number, number[]][] = [
    [weights.totalFrequency, normalize(stats.map((s) => s.totalFrequency))],
    [weights.recentFrequency, normalize(stats.map((s) => s.recentFrequency))],
    [weights.gap, normalize(stats.map((s) => s.gap))],
    [weights.sectorBalance, normalize(stats.map((s) => s.sectorDeficit))],
    [weights.fibonacciAffinity, normalize(stats.map((s) => s.fibonacciAffinity))],
    [weights.modBalance, normalize(stats.map((s) => s.modGroupDeficit))],
    [weights.totient, normalize(stats.map((s) => s.totientRatio))],
    // |z|가 작을수록 높은 점수 - 기대치에서 멀리 벗어난 번호(많이든 적게든)를 뒤로 보낸다.
    [weights.frequencyTypicality, normalize(stats.map((s) => 1 / (1 + Math.abs(s.frequencyZ))))],
    [weights.groupFrequency, normalize(stats.map((s) => s.groupFrequency))],
    [weights.groupGap, normalize(stats.map((s) => s.groupGap))],
  ];

  return stats.map((s, i) => ({
    number: s.number,
    score: parts.reduce((sum, [weight, values]) => sum + weight * values[i], 0),
  }));
}

/** 점수 상위 count개. 동점은 번호가 작은 쪽을 먼저 - 같은 입력이면 항상 같은 후보가 나온다. */
export function topCandidates(scored: readonly ScoredNumber[], count: number): ScoredNumber[] {
  return [...scored].sort((a, b) => b.score - a.score || a.number - b.number).slice(0, count);
}

/**
 * 점수 상위 count개를 고르되 한 그룹에서 cap개까지만 쓴다. 점수 순서는 그대로 유지한다.
 * 그룹은 구간(sectorIndexOf)이든 나머지(modGroupOf)든 상관없다 - 번호를 그룹 번호로
 * 바꿔주는 함수만 받는다.
 * cap이 작아 count를 채우지 못하면 cap을 넘겨서라도 채운다 - 후보 수는 레시피의 전제다.
 */
export function topCandidatesCapped(
  scored: readonly ScoredNumber[],
  count: number,
  cap: number,
  groupIndexOf: (n: number) => number,
): ScoredNumber[] {
  const ranked = [...scored].sort((a, b) => b.score - a.score || a.number - b.number);
  const used = new Map<number, number>();
  const picked: ScoredNumber[] = [];

  for (const c of ranked) {
    if (picked.length >= count) break;
    const group = groupIndexOf(c.number);
    if (group >= 0 && (used.get(group) ?? 0) >= cap) continue;
    if (group >= 0) used.set(group, (used.get(group) ?? 0) + 1);
    picked.push(c);
  }

  if (picked.length < count) {
    const taken = new Set(picked.map((c) => c.number));
    for (const c of ranked) {
      if (picked.length >= count) break;
      if (!taken.has(c.number)) picked.push(c);
    }
  }

  // top-score 조합 생성이 "앞쪽이 상위 후보"라는 순서를 전제하므로 점수순으로 돌려준다.
  return picked.sort((a, b) => b.score - a.score || a.number - b.number);
}

// ---------- 필터 ----------

/** 스펙의 조합 필터. 설정하지 않은 항목은 통과시킨다. */
export function passesFilters(
  numbers: readonly number[],
  rule: LottoRule,
  filters: FilterConfig,
  previousDraw?: LottoDraw,
): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);

  if (filters.oddEven) {
    const odd = sorted.filter((n) => n % 2 === 1).length;
    if (!filters.oddEven.some(([o, e]) => o === odd && e === sorted.length - odd)) return false;
  }

  if (filters.lowHigh) {
    const threshold = Math.floor(rule.maxNumber / 2);
    const low = sorted.filter((n) => n <= threshold).length;
    if (!filters.lowHigh.some(([l, h]) => l === low && h === sorted.length - low)) return false;
  }

  if (filters.sumRange) {
    const sum = sorted.reduce((s, n) => s + n, 0);
    if (sum < filters.sumRange[0] || sum > filters.sumRange[1]) return false;
  }

  if (filters.maxConsecutive !== undefined) {
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
      if (run > filters.maxConsecutive) return false;
    }
  }

  if (filters.maxSameEndingDigit !== undefined) {
    const byDigit = new Map<number, number>();
    for (const n of sorted) {
      const d = n % 10;
      byDigit.set(d, (byDigit.get(d) ?? 0) + 1);
    }
    for (const count of byDigit.values()) {
      if (count > filters.maxSameEndingDigit) return false;
    }
  }

  if (filters.minFibonacciGaps !== undefined) {
    if (fibonacciGapCount(sorted, rule.maxNumber) < filters.minFibonacciGaps) return false;
  }

  if (filters.previousDrawOverlap && previousDraw) {
    const prev = new Set(previousDraw.numbers);
    const overlap = sorted.filter((n) => prev.has(n)).length;
    const [min, max] = filters.previousDrawOverlap;
    if (overlap < min || overlap > max) return false;
  }

  return true;
}

// ---------- 조합 생성 ----------

export function comboKey(numbers: readonly number[]): string {
  return [...numbers].sort((a, b) => a - b).join(",");
}

function sampleFrom(candidates: readonly number[], pickCount: number, rng: Rng): number[] {
  const pool = [...candidates];
  for (let i = 0; i < pickCount; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, pickCount).sort((a, b) => a - b);
}

/**
 * 점수 높은 순으로 조합을 만든다.
 *
 * ponytail: 후보의 모든 조합을 만들지 않고, 점수순으로 정렬된 후보에서 사전식으로 훑다가
 * EXAMINE_LIMIT개를 본 시점에 멈춘다. 사전식 앞쪽이 곧 상위 후보들의 조합이라 실제로 뽑히는
 * 것은 거의 같고, 후보 24개일 때 13만 개를 전부 만드는 비용(회차마다!)을 피한다.
 * 필터가 아주 좁아 상위에서 통과분이 부족하면 무작위 표본으로 채운다.
 */
const EXAMINE_LIMIT = 5000;

function topScoreCombinations(
  candidates: readonly ScoredNumber[],
  context: StrategyContext,
  filters: FilterConfig,
  previousDraw?: LottoDraw,
): number[][] {
  const { rule, ticketCount } = context;
  const k = rule.pickCount;
  const n = candidates.length;
  const passing: { numbers: number[]; score: number }[] = [];

  const indices = Array.from({ length: k }, (_, i) => i);
  let examined = 0;

  while (examined < EXAMINE_LIMIT) {
    examined += 1;
    const numbers = indices.map((i) => candidates[i].number).sort((a, b) => a - b);
    if (passesFilters(numbers, rule, filters, previousDraw)) {
      passing.push({ numbers, score: indices.reduce((s, i) => s + candidates[i].score, 0) });
    }

    // 사전식 다음 조합
    let pos = k - 1;
    while (pos >= 0 && indices[pos] === n - k + pos) pos -= 1;
    if (pos < 0) break;
    indices[pos] += 1;
    for (let i = pos + 1; i < k; i++) indices[i] = indices[i - 1] + 1;
  }

  passing.sort((a, b) => b.score - a.score || comboKey(a.numbers).localeCompare(comboKey(b.numbers)));
  return passing.slice(0, ticketCount).map((p) => p.numbers);
}

/** 서로 다른 조합을 ticketCount개 채운다. 필터를 끝내 못 맞추면 필터를 포기하고 채운다. */
function fillTickets(
  existing: number[][],
  candidateNumbers: readonly number[],
  context: StrategyContext,
  filters: FilterConfig,
  previousDraw?: LottoDraw,
): number[][] {
  const { rule, rng, ticketCount } = context;
  const tickets = [...existing];
  const seen = new Set(tickets.map(comboKey));
  // 통과 가능한 필터라면 조합 하나를 찾는 데 보통 수십 번이면 된다. 상한을 크게 잡으면
  // 불가능한 필터(예: 합계 21~22)를 걸었을 때 회차마다 수만 번을 헛돌아 화면이 멈춘다.
  const maxAttempts = ticketCount * 200;

  for (let attempt = 0; attempt < maxAttempts && tickets.length < ticketCount; attempt++) {
    const pick = sampleFrom(candidateNumbers, rule.pickCount, rng);
    if (!passesFilters(pick, rule, filters, previousDraw)) continue;
    const key = comboKey(pick);
    if (seen.has(key)) continue;
    seen.add(key);
    tickets.push(pick);
  }

  // 티켓 수는 전략 비교의 전제다. 조용히 적게 내면 그 전략만 유리해 보이는 비교가 되므로,
  // 마지막 수단으로 필터를 무시하고서라도 개수를 맞춘다.
  for (let attempt = 0; tickets.length < ticketCount && attempt < maxAttempts; attempt++) {
    const pick = sampleFrom(candidateNumbers, rule.pickCount, rng);
    const key = comboKey(pick);
    if (seen.has(key)) continue;
    seen.add(key);
    tickets.push(pick);
  }

  if (tickets.length < ticketCount) {
    throw new Error(`후보 ${candidateNumbers.length}개로 서로 다른 ${ticketCount}조합을 만들지 못했다`);
  }
  return tickets;
}

// ---------- 레시피 → 전략 ----------

export interface RecipeAnalysis {
  targetGroup?: number;
  targetGroupLabel?: string;
  candidates: ScoredNumber[];
  stats: NumberStats[];
}

/** 레시피를 그 시점 데이터에 적용했을 때의 후보와 점수. 화면에서 "왜 이 번호인지" 보여줄 때 쓴다. */
export function analyzeWithRecipe(
  recipe: Recipe,
  history: readonly LottoDraw[],
  rule: LottoRule,
  targetRound: number,
): RecipeAnalysis {
  const targetGroup = recipe.grouping ? groupOf(targetRound, recipe.grouping) : undefined;
  const stats = computeNumberStats(history, rule, recipe.recentWindow, recipe.grouping, targetGroup);
  const scored = scoreNumbers(stats, recipe.weights);
  const count = Math.min(recipe.candidateCount, rule.maxNumber);
  let candidates: ScoredNumber[];
  if (recipe.sectorCap !== undefined) {
    candidates = topCandidatesCapped(scored, count, recipe.sectorCap, (n) => sectorIndexOf(n, rule.maxNumber));
  } else if (recipe.modGroupCap !== undefined) {
    candidates = topCandidatesCapped(scored, count, recipe.modGroupCap, modGroupOf);
  } else {
    candidates = topCandidates(scored, count);
  }

  return {
    targetGroup,
    targetGroupLabel: targetGroup === undefined ? undefined : groupLabel(targetGroup),
    candidates,
    stats,
  };
}

/** 레시피를 백테스트 엔진이 쓰는 전략으로 바꾼다. */
export function recipeStrategy(recipe: Recipe): Strategy {
  return {
    id: recipe.id,
    name: recipe.name,
    generate(context) {
      const { history, rule, targetRound } = context;
      const previousDraw = history[history.length - 1];
      const { candidates } = analyzeWithRecipe(recipe, history, rule, targetRound);
      const candidateNumbers = candidates.map((c) => c.number);

      if (recipe.selection === "top-score" && candidates.length <= MAX_ENUMERABLE_CANDIDATES) {
        const ranked = topScoreCombinations(candidates, context, recipe.filters, previousDraw);
        return fillTickets(ranked, candidateNumbers, context, recipe.filters, previousDraw);
      }

      return fillTickets([], candidateNumbers, context, recipe.filters, previousDraw);
    },
  };
}

// ---------- 프리셋 ----------

const RULE = KOREA_LOTTO_6_45;

/** 대조군. 압축도 필터도 없다 - 다른 레시피는 전부 이것과 비교된다. */
export const RANDOM_RECIPE: Recipe = {
  id: "random",
  name: "완전 무작위",
  weights: { ...ZERO_WEIGHTS },
  recentWindow: 20,
  candidateCount: RULE.maxNumber,
  filters: {},
  selection: "random",
};

export const FREQUENCY_RECIPE: Recipe = {
  id: "frequency",
  name: "출현 빈도",
  weights: { ...ZERO_WEIGHTS, totalFrequency: 0.5, recentFrequency: 0.5 },
  recentWindow: 20,
  candidateCount: 18,
  filters: {},
  selection: "random",
};

export const HOT_COLD_RECIPE: Recipe = {
  id: "hot-cold",
  name: "핫/콜드 + 미출현",
  weights: { ...ZERO_WEIGHTS, totalFrequency: 0.4, recentFrequency: 0.3, gap: 0.3 },
  recentWindow: 20,
  candidateCount: 18,
  filters: {},
  selection: "random",
};

/**
 * 같은 그룹이었던 과거 회차의 통계에 무게를 싣는다.
 *
 * 오우치식의 착안점만 옮긴 것이라 이름에 "오우치"를 넣지 않는다. 일본 Lotto 6은 볼세트
 * 10개를 돌려 쓰고 그 세트가 회차마다 공개되므로 "같은 세트였던 과거"가 물리적으로 존재하지만,
 * 한국 6/45에는 세트구가 없다. 여기서 말하는 그룹은 회차 번호를 10으로 나눈 나머지일 뿐
 * 물리적 근거가 없으므로, 화면에도 하는 일("회차주기 그룹") 그대로 적는다.
 */
export const ROUND_GROUP_RECIPE: Recipe = {
  id: "round-group",
  name: "회차주기 그룹(10)",
  weights: {
    ...ZERO_WEIGHTS,
    totalFrequency: 0.2,
    recentFrequency: 0.2,
    gap: 0.15,
    groupFrequency: 0.25,
    groupGap: 0.2,
  },
  recentWindow: 20,
  candidateCount: 18,
  grouping: { kind: "round-cycle", groupCount: 10 },
  filters: {},
  selection: "random",
};

/** 한국 커뮤니티에서 흔히 쓰는 조합 조건을 필터로 건 것. */
export const PATTERN_RECIPE: Recipe = {
  id: "pattern",
  name: "패턴 필터",
  weights: { ...ZERO_WEIGHTS },
  recentWindow: 20,
  candidateCount: RULE.maxNumber,
  filters: {
    oddEven: [
      [3, 3],
      [4, 2],
      [2, 4],
    ],
    sumRange: [100, 175],
    maxConsecutive: 2,
    maxSameEndingDigit: 2,
  },
  selection: "random",
};

/**
 * 번호를 6구간 원으로 보고, 빈도·최근빈도·미출현·구간균형 네 요소를 4:3:2:1로 섞어 45개에서
 * 15개로 좁힌다. 아르키메데스가 쓴 공식이 아니라 그가 다룬 비례와 균형을 통계에 옮긴 것이다
 * (아르키메데스는 로또를 몰랐다). 가중치 4:3:2:1은 검증으로 고른 값이 아니라 정한 값이며,
 * 다른 레시피와 마찬가지로 다음 회차 확률을 바꾸지 못한다 - 후보를 좁히고 모양을 고를 뿐이다.
 */
export const ARCHIMEDES_RECIPE: Recipe = {
  id: "archimedes",
  name: "아르키메데스 45→15",
  weights: {
    ...ZERO_WEIGHTS,
    totalFrequency: 0.4,
    recentFrequency: 0.3,
    gap: 0.2,
    sectorBalance: 0.1,
  },
  recentWindow: 100,
  candidateCount: 15,
  // 15개를 6구간에 흩어 놓는다. 상한 3이면 최소 5개 구간이 후보에 들어온다.
  sectorCap: 3,
  filters: {
    oddEven: [
      [2, 4],
      [3, 3],
      [4, 2],
    ],
    lowHigh: [
      [2, 4],
      [3, 3],
      [4, 2],
    ],
    sumRange: [100, 175],
    maxConsecutive: 2,
  },
  selection: "random",
};

/**
 * 피보나치 수열을 중심으로 45개를 15개로 좁힌다. 수열 번호(1,2,3,5,8,13,21,34) 8개만 쓰면
 * 후보가 너무 좁아 "가까운 번호"까지 점수를 주고, 조합은 인접 간격 5개 중 3개 이상이
 * 피보나치 수인 것만 남긴다.
 *
 * 수열이 추첨 결과를 따라간다는 근거는 없다. 가중치 25/30/20/10/15는 검증으로 고른 값이
 * 아니라 정한 값이고, 간격이 수열과 맞아도 당첨 확률은 1/8,145,060으로 같다.
 */
export const FIBONACCI_RECIPE: Recipe = {
  id: "fibonacci",
  name: "피보나치 45→15",
  weights: {
    ...ZERO_WEIGHTS,
    fibonacciAffinity: 0.25,
    totalFrequency: 0.3,
    recentFrequency: 0.2,
    gap: 0.1,
    sectorBalance: 0.15,
  },
  recentWindow: 50,
  candidateCount: 15,
  sectorCap: 3,
  filters: {
    sumRange: [100, 175],
    maxConsecutive: 2,
    // 간격 5개 중 3개. 4개 이상을 요구하면 후보 15개로는 통과 조합이 거의 없다.
    minFibonacciGaps: 3,
  },
  selection: "random",
};

/**
 * 파스칼 - 번호를 좁히지 않고 조합의 모양만 고른다.
 *
 * 조합론에는 "어느 번호가 더 유망한가"라는 답이 없다. 45개가 모두 같은 확률이라는 것이 조합
 * 계산의 결론이므로 후보 압축을 하지 않고(candidateCount = 45), 대신 조합 수가 가장 많은
 * 모양만 남긴다. 6/45에서 홀짝은 3:3이 가장 많고(C(23,3)×C(22,3) = 2,727,340개) 4:2, 2:4가
 * 그 뒤를 잇는다. 저고도 같은 모양이고, 합계는 100~175 구간에 대부분이 들어 있다.
 *
 * 흔한 모양을 고르는 것은 "그 모양이 나올 확률이 높다"는 뜻이지, 내 조합이 당첨될 확률이
 * 올라간다는 뜻이 아니다 - 흔한 모양일수록 그 모양을 나눠 갖는 조합도 많다.
 */
export const PASCAL_RECIPE: Recipe = {
  id: "pascal",
  name: "파스칼 조합",
  weights: { ...ZERO_WEIGHTS },
  recentWindow: 20,
  candidateCount: RULE.maxNumber,
  filters: {
    oddEven: [
      [3, 3],
      [4, 2],
      [2, 4],
    ],
    lowHigh: [
      [3, 3],
      [4, 2],
      [2, 4],
    ],
    sumRange: [100, 175],
  },
  selection: "random",
};

/**
 * 오일러 - 번호를 나머지(n mod 5)로 묶고, 정수론 값 φ(n)/n을 보조 점수로 쓴다.
 *
 * 나머지 그룹은 45를 아홉 개씩 다섯 묶음으로 가른다(…0, …1, …2, …3, …4). 최근에 덜 나온
 * 그룹에 점수를 주고, 서로소를 많이 가진 번호(φ(n)/n이 큰 수 - 소수 쪽)에 점수를 더한다.
 *
 * 오일러가 제시한 공식이 아니다. 가중치 35/25/20/20은 정한 값이고, 나머지 그룹이 "쉴 차례"
 * 라거나 서로소인 번호가 더 잘 나온다는 근거는 없다 - 묶는 기준을 바꾼 것뿐이다.
 */
export const EULER_RECIPE: Recipe = {
  id: "euler",
  name: "오일러 45→15",
  weights: {
    ...ZERO_WEIGHTS,
    totalFrequency: 0.35,
    recentFrequency: 0.25,
    modBalance: 0.2,
    totient: 0.2,
  },
  recentWindow: 50,
  candidateCount: 15,
  // 나머지 그룹이 다섯이라 한 그룹에서 4개까지면 최소 네 그룹이 후보에 들어온다.
  modGroupCap: 4,
  filters: {
    sumRange: [100, 175],
    maxConsecutive: 2,
  },
  selection: "random",
};

/**
 * 가우시안 - 합계의 퍼짐을 자로 재서 중심부만 남긴다.
 *
 * 6/45 합계의 이론 평균은 138, 표준편차는 약 29.95다. 평균 ±1표준편차(109~167) 안의 합계만
 * 남기고, 번호는 출현 횟수가 이론 기대치에 가까운 쪽(표준점수 |z|가 작은 쪽)을 고른다.
 *
 * 중심부 합계를 고르는 것은 "그 합계가 나올 확률이 높다"는 뜻이지 내 조합의 당첨 확률이
 * 올라간다는 뜻이 아니다 - 중심부 합계일수록 그 합계를 나눠 갖는 조합도 많다.
 *
 * 빈도 가중치를 섞지 않는다. 처음에 표준점수 0.4 + 전체빈도 0.35 + 최근빈도 0.25로 짰더니
 * 빈도 쪽 0.6이 표준점수를 눌러, 출현 횟수가 기대치에서 +3σ 벗어난 번호가 후보 1위로
 * 올라왔다(테스트로 잡혔다). "많이 나온 번호를 특별하게 읽지 않는다"는 것이 이 방법의
 * 요지인데 많이 나온 번호를 고르면 방법이 자기 말을 뒤집는다. 그래서 번호는 표준점수만으로
 * 고르고, 합계는 필터로 중심부만 남긴다.
 */
export const GAUSSIAN_RECIPE: Recipe = {
  id: "gaussian",
  name: "가우시안 45→15",
  weights: {
    ...ZERO_WEIGHTS,
    frequencyTypicality: 1,
  },
  recentWindow: 50,
  candidateCount: 15,
  sectorCap: 3,
  filters: {
    // 평균 ±1σ. 숫자를 박아 넣지 않고 규칙에서 계산한다 - 규칙이 바뀌면 구간도 따라간다.
    sumRange: sumRangeForZ(1, RULE),
    maxConsecutive: 2,
  },
  selection: "random",
};

export const PRESET_RECIPES: readonly Recipe[] = [
  RANDOM_RECIPE,
  FREQUENCY_RECIPE,
  HOT_COLD_RECIPE,
  ROUND_GROUP_RECIPE,
  PATTERN_RECIPE,
  ARCHIMEDES_RECIPE,
  FIBONACCI_RECIPE,
  PASCAL_RECIPE,
  EULER_RECIPE,
  GAUSSIAN_RECIPE,
];

/** 유저가 만든 레시피를 담을 때 쓰는 빈 틀. */
export function emptyRecipe(id = "custom", name = "내 분석법"): Recipe {
  return {
    id,
    name,
    weights: { ...ZERO_WEIGHTS },
    recentWindow: 20,
    candidateCount: RULE.maxNumber,
    filters: {},
    selection: "random",
  };
}
