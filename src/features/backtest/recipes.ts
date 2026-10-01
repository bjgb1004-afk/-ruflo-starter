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

// ---------- 회차주기 그룹 ----------

export const GROUP_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

/** 회차가 속한 그룹 번호. 당첨번호를 보지 않고 회차 번호만으로 정해지므로 미래 정보가 아니다. */
export function groupOf(round: number, grouping: GroupingConfig): number {
  return ((round % grouping.groupCount) + grouping.groupCount) % grouping.groupCount;
}

export function groupLabel(index: number): string {
  return GROUP_LABELS[index] ?? `G${index + 1}`;
}

// ---------- 숫자별 통계 ----------

export interface NumberStats {
  number: number;
  totalFrequency: number;
  recentFrequency: number;
  /** 마지막 출현 이후 지난 회차 수. 한 번도 안 나왔으면 history 길이. */
  gap: number;
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
    groupFrequency: 0,
    groupGap: 0,
  }));

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
      if (fromEnd < recentWindow) s.recentFrequency += 1;
      if (inGroup) {
        s.groupFrequency += 1;
        s.groupGap = groupDrawCount - groupDrawsSeen;
      }
    }
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
  const candidates = topCandidates(scored, Math.min(recipe.candidateCount, rule.maxNumber));

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

export const PRESET_RECIPES: readonly Recipe[] = [
  RANDOM_RECIPE,
  FREQUENCY_RECIPE,
  HOT_COLD_RECIPE,
  ROUND_GROUP_RECIPE,
  PATTERN_RECIPE,
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
