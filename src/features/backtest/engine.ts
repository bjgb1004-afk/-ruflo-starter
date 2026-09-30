// Walk-forward 백테스트 엔진.
//
// 누수 방지가 이 파일의 존재 이유다. 전략은 runBacktest가 잘라 넘긴 history만 받고, 대상 회차
// 객체는 채점 단계에서만 쓰인다. 전략 쪽에서 미래를 참조하려 해도 참조할 대상이 없다.

import type {
  BacktestOptions,
  BacktestResult,
  BacktestRunMeta,
  DataIssue,
  LottoDraw,
  LottoRule,
  Rng,
  RoundResult,
  Strategy,
} from "./types";
import { ALGORITHM_VERSION } from "./types";

// ---------- 난수 ----------

function hashString(s: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** 문자열 시드로 재현 가능한 난수기를 만든다. 같은 시드면 항상 같은 수열. */
export function seededRng(seed: string): Rng {
  let a = hashString(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 데이터 검증 (스펙 20장) ----------

/** 문제를 찾아 목록으로 돌려준다. 조용히 넘기지 않는다. */
export function validateDraws(draws: readonly LottoDraw[], rule: LottoRule): DataIssue[] {
  const issues: DataIssue[] = [];
  const sorted = [...draws].sort((a, b) => a.round - b.round);
  const seenRounds = new Set<number>();

  for (const draw of sorted) {
    if (seenRounds.has(draw.round)) {
      issues.push({ kind: "duplicate-round", round: draw.round, detail: "같은 회차가 두 번 있다" });
    }
    seenRounds.add(draw.round);

    if (draw.numbers.length !== rule.pickCount) {
      issues.push({
        kind: "bad-number-count",
        round: draw.round,
        detail: `번호가 ${draw.numbers.length}개 (${rule.pickCount}개여야 함)`,
      });
    }
    if (new Set(draw.numbers).size !== draw.numbers.length) {
      issues.push({ kind: "duplicate-number", round: draw.round, detail: `중복 번호: ${draw.numbers.join(",")}` });
    }
    for (const n of draw.numbers) {
      if (!Number.isInteger(n) || n < 1 || n > rule.maxNumber) {
        issues.push({ kind: "out-of-range", round: draw.round, detail: `범위를 벗어난 번호: ${n}` });
      }
    }
    if (rule.bonusEnabled && draw.bonus !== undefined) {
      const bonusBad = !Number.isInteger(draw.bonus) || draw.bonus < 1 || draw.bonus > rule.maxNumber;
      if (bonusBad || draw.numbers.includes(draw.bonus)) {
        issues.push({ kind: "bad-bonus", round: draw.round, detail: `보너스 번호 이상: ${draw.bonus}` });
      }
    }
    if (rule.setBallEnabled && draw.setBall !== undefined && !rule.setBallNames?.includes(draw.setBall)) {
      issues.push({ kind: "bad-set-ball", round: draw.round, detail: `알 수 없는 세트구: ${draw.setBall}` });
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].round - sorted[i - 1].round;
    if (gap > 1) {
      issues.push({
        kind: "missing-round",
        round: sorted[i - 1].round + 1,
        detail: `${sorted[i - 1].round}회와 ${sorted[i].round}회 사이 ${gap - 1}개 회차가 없다`,
      });
    }
  }

  return issues;
}

// ---------- 채점 ----------

export function countMatches(ticket: readonly number[], winningNumbers: readonly number[]): number {
  const winning = new Set(winningNumbers);
  return [...new Set(ticket)].filter((n) => winning.has(n)).length;
}

export type WinRank = 1 | 2 | 3 | 4 | 5 | null;

/** 로또 6/45 표준 등수. 6개=1등, 5개+보너스=2등, 5개=3등, 4개=4등, 3개=5등. */
export function rankOf(matchCount: number, hasBonus: boolean, rule: LottoRule): WinRank {
  const { pickCount } = rule;
  if (matchCount === pickCount) return 1;
  if (matchCount === pickCount - 1 && rule.bonusEnabled && hasBonus) return 2;
  if (matchCount === pickCount - 1) return 3;
  if (matchCount === pickCount - 2) return 4;
  if (matchCount === pickCount - 3) return 5;
  return null;
}

// ---------- 엔진 ----------

export interface BacktestRun {
  results: BacktestResult[];
  meta: BacktestRunMeta;
  issues: DataIssue[];
}

/**
 * 각 대상 회차마다 그 이전 데이터만으로 조합을 만들고, 그 회차 실제 당첨번호로 채점한다.
 * 모든 전략이 같은 회차·같은 티켓 수로 돌아가므로 결과를 그대로 비교할 수 있다.
 */
export function runBacktest(
  draws: readonly LottoDraw[],
  strategies: readonly Strategy[],
  options: BacktestOptions,
): BacktestRun {
  const { rule, ticketCount, minimumHistory, fromRound, toRound, seed, params } = options;

  if (params.candidateCount < rule.pickCount) {
    throw new Error(`candidateCount(${params.candidateCount})가 pickCount(${rule.pickCount})보다 작다`);
  }

  const sorted = [...draws].sort((a, b) => a.round - b.round);
  const issues = validateDraws(sorted, rule);

  const accumulators = strategies.map((strategy) => ({
    strategy,
    matchCounts: new Array<number>(rule.pickCount + 1).fill(0),
    rankCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>,
    perRound: [] as RoundResult[],
    matchSum: 0,
    tickets: 0,
  }));

  let testedFrom = Number.POSITIVE_INFINITY;
  let testedTo = Number.NEGATIVE_INFINITY;
  let drawsTested = 0;

  for (let idx = 0; idx < sorted.length; idx++) {
    if (idx < minimumHistory) continue;
    const target = sorted[idx];
    if (fromRound !== undefined && target.round < fromRound) continue;
    if (toRound !== undefined && target.round > toRound) continue;

    // 여기가 누수 차단선. 전략은 이 슬라이스 밖을 볼 수 없다.
    const history = sorted.slice(0, idx);
    drawsTested += 1;
    testedFrom = Math.min(testedFrom, target.round);
    testedTo = Math.max(testedTo, target.round);

    for (const acc of accumulators) {
      const rng = seededRng(`${seed}|${acc.strategy.id}|${target.round}`);
      const tickets = acc.strategy.generate({ history, rule, rng, ticketCount, params });

      if (tickets.length !== ticketCount) {
        throw new Error(
          `${acc.strategy.id}가 ${target.round}회에서 ${tickets.length}조합을 냈다 (${ticketCount}개여야 함)`,
        );
      }

      const matches: number[] = [];
      for (const ticket of tickets) {
        if (ticket.length !== rule.pickCount || new Set(ticket).size !== rule.pickCount) {
          throw new Error(`${acc.strategy.id}가 ${target.round}회에서 잘못된 조합을 냈다: ${ticket.join(",")}`);
        }
        if (ticket.some((n) => n < 1 || n > rule.maxNumber)) {
          throw new Error(`${acc.strategy.id}가 ${target.round}회에서 범위 밖 번호를 냈다: ${ticket.join(",")}`);
        }

        const matchCount = countMatches(ticket, target.numbers);
        const hasBonus = target.bonus !== undefined && ticket.includes(target.bonus);
        matches.push(matchCount);
        acc.matchCounts[matchCount] += 1;
        acc.matchSum += matchCount;
        acc.tickets += 1;
        const rank = rankOf(matchCount, hasBonus, rule);
        if (rank !== null) acc.rankCounts[rank] += 1;
      }

      acc.perRound.push({
        round: target.round,
        matches,
        bestMatch: Math.max(...matches),
        averageMatch: matches.reduce((s, m) => s + m, 0) / matches.length,
      });
    }
  }

  if (drawsTested === 0) {
    throw new Error("테스트할 회차가 없다 - minimumHistory나 fromRound/toRound 범위를 확인할 것");
  }

  const results: BacktestResult[] = accumulators.map((acc) => ({
    strategyId: acc.strategy.id,
    strategyName: acc.strategy.name,
    drawsTested,
    ticketsPerDraw: ticketCount,
    totalTickets: acc.tickets,
    matchCounts: acc.matchCounts,
    averageMatches: acc.matchSum / acc.tickets,
    atLeast3: acc.matchCounts.slice(3).reduce((s, c) => s + c, 0),
    atLeast4: acc.matchCounts.slice(4).reduce((s, c) => s + c, 0),
    atLeast5: acc.matchCounts.slice(5).reduce((s, c) => s + c, 0),
    jackpot: acc.matchCounts[rule.pickCount],
    rankCounts: acc.rankCounts,
    perRound: acc.perRound,
  }));

  return {
    results,
    issues,
    meta: {
      algorithmVersion: ALGORITHM_VERSION,
      dataRange: { from: sorted[0].round, to: sorted[sorted.length - 1].round, count: sorted.length },
      testRange: { from: testedFrom, to: testedTo },
      options,
      executedAt: new Date().toISOString(),
    },
  };
}

// ---------- 데이터 분리 (스펙 16장) ----------

export interface SplitRanges {
  training: { from: number; to: number };
  validation: { from: number; to: number };
  test: { from: number; to: number };
}

/**
 * 회차 순서대로 앞에서부터 training/validation/test로 나눈다. 시간 순서를 지키므로
 * 미래 데이터가 과거 구간 분석에 들어가지 않는다.
 */
export function splitByRatio(
  draws: readonly LottoDraw[],
  trainingRatio = 0.7,
  validationRatio = 0.15,
): SplitRanges {
  const sorted = [...draws].sort((a, b) => a.round - b.round);
  const n = sorted.length;
  const trainEnd = Math.floor(n * trainingRatio);
  const validEnd = Math.floor(n * (trainingRatio + validationRatio));

  return {
    training: { from: sorted[0].round, to: sorted[trainEnd - 1].round },
    validation: { from: sorted[trainEnd].round, to: sorted[validEnd - 1].round },
    test: { from: sorted[validEnd].round, to: sorted[n - 1].round },
  };
}
