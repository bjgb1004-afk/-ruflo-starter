// 비교 대상 전략들. 모두 같은 StrategyContext를 받고 같은 개수의 조합을 낸다.
//
// 어느 전략도 대상 회차를 볼 수 없다 - context.history가 이미 그 이전까지만 잘려서 온다.

import type { FilterConfig, LottoDraw, LottoRule, Rng, Strategy, StrategyContext } from "./types";

// ---------- 공통 도구 ----------

export function comboKey(numbers: readonly number[]): string {
  return [...numbers].sort((a, b) => a - b).join(",");
}

/** 후보 배열에서 pickCount개를 중복 없이 뽑는다. */
function sampleFrom(candidates: readonly number[], pickCount: number, rng: Rng): number[] {
  const pool = [...candidates];
  for (let i = 0; i < pickCount; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, pickCount).sort((a, b) => a - b);
}

/** 스펙 11장의 필터. 설정되지 않은 항목은 통과시킨다. */
export function passesFilters(numbers: readonly number[], rule: LottoRule, filters: FilterConfig): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);

  if (filters.oddEven) {
    const odd = sorted.filter((n) => n % 2 === 1).length;
    const even = sorted.length - odd;
    if (!filters.oddEven.some(([o, e]) => o === odd && e === even)) return false;
  }

  if (filters.lowHigh) {
    const threshold = Math.floor(rule.maxNumber / 2);
    const low = sorted.filter((n) => n <= threshold).length;
    const high = sorted.length - low;
    if (!filters.lowHigh.some(([l, h]) => l === low && h === high)) return false;
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

  return true;
}

/** 후보군에서 서로 다른 조합을 ticketCount개 만든다. 필터를 못 맞추면 필터를 포기하고 채운다. */
function buildTickets(candidates: readonly number[], context: StrategyContext): number[][] {
  const { rule, rng, ticketCount, params } = context;
  const tickets: number[][] = [];
  const seen = new Set<string>();
  const maxAttempts = ticketCount * 2000;

  for (let attempt = 0; attempt < maxAttempts && tickets.length < ticketCount; attempt++) {
    const pick = sampleFrom(candidates, rule.pickCount, rng);
    if (!passesFilters(pick, rule, params.filters)) continue;
    const key = comboKey(pick);
    if (seen.has(key)) continue;
    seen.add(key);
    tickets.push(pick);
  }

  // 필터가 너무 좁아 못 채운 경우. 티켓 수는 전략 비교의 전제라 반드시 맞추되, 마지막 수단으로
  // 필터를 무시한다. 조용히 적게 내면 그 전략만 유리해 보이는 비교가 된다(스펙 13장).
  for (let attempt = 0; tickets.length < ticketCount && attempt < maxAttempts; attempt++) {
    const pick = sampleFrom(candidates, rule.pickCount, rng);
    const key = comboKey(pick);
    if (seen.has(key)) continue;
    seen.add(key);
    tickets.push(pick);
  }

  if (tickets.length < ticketCount) {
    throw new Error(`buildTickets: 후보 ${candidates.length}개로 서로 다른 ${ticketCount}조합을 만들지 못했다`);
  }
  return tickets;
}

function allNumbers(rule: LottoRule): number[] {
  return Array.from({ length: rule.maxNumber }, (_, i) => i + 1);
}

// ---------- 숫자별 통계 ----------

export interface NumberStats {
  number: number;
  /** 전체 출현 횟수. */
  totalFrequency: number;
  /** recentWindows별 출현 횟수. 키는 구간 크기. */
  recentFrequency: Record<number, number>;
  /** 마지막 출현 이후 지난 회차 수. 한 번도 안 나왔으면 history 길이. */
  gap: number;
}

/** history(대상 회차 이전까지)만 보고 숫자별 통계를 만든다. */
export function computeNumberStats(
  history: readonly LottoDraw[],
  rule: LottoRule,
  recentWindows: readonly number[],
): NumberStats[] {
  const stats: NumberStats[] = allNumbers(rule).map((number) => ({
    number,
    totalFrequency: 0,
    recentFrequency: Object.fromEntries(recentWindows.map((w) => [w, 0])),
    gap: history.length,
  }));

  for (let i = 0; i < history.length; i++) {
    const fromEnd = history.length - 1 - i; // 0이면 가장 최근 회차
    for (const n of history[i].numbers) {
      const s = stats[n - 1];
      if (!s) continue;
      s.totalFrequency += 1;
      s.gap = fromEnd;
      for (const w of recentWindows) {
        if (fromEnd < w) s.recentFrequency[w] += 1;
      }
    }
  }

  return stats;
}

/** 0~1로 정규화. 전부 같은 값이면 0.5로 둔다(점수 차가 없다는 뜻). */
function normalize(values: readonly number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

/** 점수 상위 candidateCount개를 후보로 압축한다. 동점은 번호가 작은 쪽을 먼저(재현성). */
function topCandidates(scores: readonly { number: number; score: number }[], count: number): number[] {
  return [...scores]
    .sort((a, b) => b.score - a.score || a.number - b.number)
    .slice(0, count)
    .map((s) => s.number);
}

// ---------- A. 완전 무작위 ----------

export const randomStrategy: Strategy = {
  id: "random",
  name: "완전 무작위",
  generate(context) {
    // 후보 압축 없이 전체 번호에서 뽑는다. 이것이 다른 전략들의 기준선이다.
    return buildTickets(allNumbers(context.rule), context);
  },
};

// ---------- B. 출현 빈도 ----------

export const frequencyStrategy: Strategy = {
  id: "frequency",
  name: "출현 빈도",
  generate(context) {
    const { history, rule, params } = context;
    const stats = computeNumberStats(history, rule, params.recentWindows);

    const totals = normalize(stats.map((s) => s.totalFrequency));
    // 구간별 최근 빈도를 평균내 하나의 "최근" 점수로 합친다.
    const recentPerWindow = params.recentWindows.map((w) => normalize(stats.map((s) => s.recentFrequency[w])));
    const recent = stats.map((_, i) =>
      recentPerWindow.length === 0 ? 0 : recentPerWindow.reduce((sum, arr) => sum + arr[i], 0) / recentPerWindow.length,
    );

    const scores = stats.map((s, i) => ({ number: s.number, score: totals[i] * 0.5 + recent[i] * 0.5 }));
    return buildTickets(topCandidates(scores, params.candidateCount), context);
  },
};

// ---------- C. 핫/콜드 + 미출현 기간 ----------

export const hotColdStrategy: Strategy = {
  id: "hot-cold",
  name: "핫/콜드 + 미출현",
  generate(context) {
    const { history, rule, params } = context;
    const stats = computeNumberStats(history, rule, params.recentWindows);
    const { frequency: wF, recent: wR, gap: wG } = params.weights;

    const totals = normalize(stats.map((s) => s.totalFrequency));
    const recentPerWindow = params.recentWindows.map((w) => normalize(stats.map((s) => s.recentFrequency[w])));
    const recent = stats.map((_, i) =>
      recentPerWindow.length === 0 ? 0 : recentPerWindow.reduce((sum, arr) => sum + arr[i], 0) / recentPerWindow.length,
    );
    // 오래 안 나온 번호일수록 높은 점수. "이제 나올 때가 됐다"는 통념을 그대로 점수화한 것이며,
    // 추첨이 독립인 이상 근거는 없다 - 그 통념이 실제로 통하는지 재는 게 이 백테스트의 목적이다.
    const gaps = normalize(stats.map((s) => s.gap));

    const scores = stats.map((s, i) => ({
      number: s.number,
      score: totals[i] * wF + recent[i] * wR + gaps[i] * wG,
    }));
    return buildTickets(topCandidates(scores, params.candidateCount), context);
  },
};

export const KOREAN_STRATEGIES: readonly Strategy[] = [randomStrategy, frequencyStrategy, hotColdStrategy];
