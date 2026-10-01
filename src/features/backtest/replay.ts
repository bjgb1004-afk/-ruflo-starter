// 내 번호 한 조합을 지난 회차에 그대로 대입해 본다. 바둑 복기와 같다 - 예측이 아니라
// 이미 나온 결과를 되짚는 것이라 여기 나오는 숫자는 전부 실제로 일어난 일이다.
//
// engine.ts의 백테스트와 목적이 다르다. 그쪽은 "뽑는 방법끼리 비교"라 평균을 보고,
// 평균은 어떤 번호를 넣어도 0.8개로 똑같이 나온다. 여기는 "이 번호의 최고 기록"을 본다.
// 최고 기록은 사람마다 다르고, 그래서 볼 만하다.
//
// 쓴 돈과 당첨금은 계산하지 않는다. 이 화면은 번호가 과거에 어디까지 갔는지만 보여준다.

import { countMatches, rankOf, type WinRank } from "./engine";
import { KOREA_LOTTO_6_45, type LottoDraw, type LottoRule } from "./types";

export type HitRank = Exclude<WinRank, null>;

export interface ReplayHit {
  round: number;
  drawDate?: string;
  matchCount: number;
  rank: HitRank;
  /** 그 회차 당첨번호. 내 번호 중 어느 게 맞았는지 화면에서 표시하는 데 쓴다. */
  winningNumbers: number[];
  bonus?: number;
  /** 보너스까지 맞아 2등이 된 경우에만 true. */
  bonusMatched: boolean;
}

export interface ReplayResult {
  roundsPlayed: number;
  from: number;
  to: number;
  /** 등수에 든 회차만. 성적 좋은 순, 같은 등수면 최근 회차가 앞. */
  hits: ReplayHit[];
  rankCounts: Record<HitRank, number>;
  /** 등수에 한 번도 못 들면 null. */
  best: ReplayHit | null;
}

/**
 * ticket을 draws 전부에 대입한다. draws는 회차 오름차순이라고 가정하지 않는다.
 */
export function replay(
  ticket: readonly number[],
  draws: readonly LottoDraw[],
  rule: LottoRule = KOREA_LOTTO_6_45,
): ReplayResult {
  if (new Set(ticket).size !== rule.pickCount) {
    throw new Error(`번호 ${rule.pickCount}개를 서로 다르게 골라야 한다 (받은 값: ${ticket.join(",")})`);
  }

  const hits: ReplayHit[] = [];
  const rankCounts: Record<HitRank, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;

  for (const draw of draws) {
    from = Math.min(from, draw.round);
    to = Math.max(to, draw.round);

    const matchCount = countMatches(ticket, draw.numbers);
    const bonusMatched = draw.bonus !== undefined && ticket.includes(draw.bonus);
    const rank = rankOf(matchCount, bonusMatched, rule);
    if (rank === null) continue;

    rankCounts[rank] += 1;
    hits.push({
      round: draw.round,
      drawDate: draw.drawDate,
      matchCount,
      rank,
      winningNumbers: draw.numbers,
      bonus: draw.bonus,
      // 5개를 맞춘 회차에서만 보너스가 등수를 가른다. 3·4개 맞은 회차에 보너스가
      // 섞여 있어도 등수와 무관하므로 표시하지 않는다.
      bonusMatched: rank === 2,
    });
  }

  hits.sort((a, b) => a.rank - b.rank || b.round - a.round);

  return {
    roundsPlayed: draws.length,
    from: draws.length ? from : 0,
    to: draws.length ? to : 0,
    hits,
    rankCounts,
    best: hits[0] ?? null,
  };
}

export const RANK_LABEL: Record<HitRank, string> = {
  1: "1등",
  2: "2등",
  3: "3등",
  4: "4등",
  5: "5등",
};

/** "6개 맞음", "5개 + 보너스" 처럼 읽히는 문구. */
export function hitDescription(hit: ReplayHit): string {
  return hit.bonusMatched ? `${hit.matchCount}개 + 보너스` : `${hit.matchCount}개 맞음`;
}
