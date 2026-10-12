// 내 번호 한 조합을 지난 회차에 그대로 대입해 본다. 바둑 복기와 같다 - 예측이 아니라
// 이미 나온 결과를 되짚는 것이라 여기 나오는 숫자는 전부 실제로 일어난 일이다.
//
// engine.ts의 백테스트와 목적이 다르다. 그쪽은 "뽑는 방법끼리 비교"라 평균을 보고,
// 평균은 어떤 번호를 넣어도 0.8개로 똑같이 나온다. 여기는 "이 번호의 최고 기록"을 본다.
// 최고 기록은 사람마다 다르고, 그래서 볼 만하다.
//
// 받았을 당첨금은 더하고 쓴 돈은 더하지 않는다. 의도적이다 - 이 화면이 답하는 질문은
// "이 번호가 어디까지 갔나"지 "로또가 남는 장사인가"가 아니다. 화면 안내문에 사지 않았으면
// 받을 수 없는 돈이라고 분명히 적는다.

import { countMatches, rankOf, type WinRank } from "./engine";
import { KOREA_LOTTO_6_45, type LottoDraw, type LottoRule } from "./types";

export type HitRank = Exclude<WinRank, null>;

/**
 * 4·5등은 회차와 무관하게 금액이 정해져 있다(복권 및 복권기금법 시행령). 1~3등은 당첨자
 * 수로 나누므로 회차 데이터(LottoDraw.prizePerWin)에서 가져온다.
 */
export const FIXED_PRIZE: Record<4 | 5, number> = { 4: 50_000, 5: 5_000 };

export interface ReplayHit {
  round: number;
  drawDate?: string;
  matchCount: number;
  rank: HitRank;
  /** 그 회차에 이 번호로 받았을 1인 당첨금(원). 금액을 모르는 회차는 0. */
  prize: number;
  /**
   * 그 회차의 그 등수 금액을 알고 있는지. false면 prize는 0이지만 "0원을 받았다"가 아니라
   * "얼마인지 모른다"는 뜻이다 - 둘을 섞으면 1등이 0원으로 표시된다(실제 버그였다).
   */
  prizeKnown: boolean;
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
  /** 등수에 든 회차만. 최근 회차가 앞. */
  hits: ReplayHit[];
  rankCounts: Record<HitRank, number>;
  /** 등수별 당첨금 합계(원). 금액을 모르는 회차는 더하지 않는다. */
  prizeByRank: Record<HitRank, number>;
  /** 등수별로 "금액을 몰라서 합계에 못 넣은" 회차 수. 화면이 0원과 구분해 적는 데 쓴다. */
  unknownByRank: Record<HitRank, number>;
  /** 금액을 몰라서 합계에서 빠진 회차 수(전 등수 합). */
  prizeUnknownCount: number;
  /** 전체 당첨금 합계(원). 금액을 아는 회차만 더한 값이다. */
  totalPrize: number;
  /** 등수에 한 번도 못 들면 null. */
  best: ReplayHit | null;
}

/**
 * 그 회차에 그 등수로 받았을 1인 당첨금. 회차 데이터에 금액이 없으면 null이다.
 *
 * null과 0을 구분하는 것이 중요하다. 1~3등 금액은 회차마다 다르고 DB에 비어 있을 수 있는데
 * (추첨 직후 배당 발표 전, 과거 회차 백필 누락), 이것을 0으로 돌려주면 1등을 맞힌 회차가
 * 화면에 "0원"으로 나온다. 없는 돈을 지어내지도, 있는 돈을 0원이라고 말하지도 않는다.
 */
export function prizeOf(rank: HitRank, draw: LottoDraw): number | null {
  if (rank === 4 || rank === 5) return FIXED_PRIZE[rank];
  return draw.prizePerWin?.[rank] ?? null;
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
  const prizeByRank: Record<HitRank, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const unknownByRank: Record<HitRank, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;

  for (const draw of draws) {
    from = Math.min(from, draw.round);
    to = Math.max(to, draw.round);

    const matchCount = countMatches(ticket, draw.numbers);
    const bonusMatched = draw.bonus !== undefined && ticket.includes(draw.bonus);
    const rank = rankOf(matchCount, bonusMatched, rule);
    if (rank === null) continue;

    const prize = prizeOf(rank, draw);
    rankCounts[rank] += 1;
    if (prize === null) unknownByRank[rank] += 1;
    else prizeByRank[rank] += prize;
    hits.push({
      round: draw.round,
      drawDate: draw.drawDate,
      matchCount,
      rank,
      prize: prize ?? 0,
      prizeKnown: prize !== null,
      winningNumbers: draw.numbers,
      bonus: draw.bonus,
      // 5개를 맞춘 회차에서만 보너스가 등수를 가른다. 3·4개 맞은 회차에 보너스가
      // 섞여 있어도 등수와 무관하므로 표시하지 않는다.
      bonusMatched: rank === 2,
    });
  }

  // 최근 회차부터 내려간다. 등수순으로 정렬하면 4등·5등이 뭉쳐서 회차가 튀어 보인다 -
  // 목록은 "언제 됐나"를 읽는 자리고, "얼마나 잘 됐나"는 최고 기록 카드가 따로 맡는다.
  hits.sort((a, b) => b.round - a.round);

  // 최고 기록은 정렬과 따로 고른다. 등수가 낮을수록(1등에 가까울수록) 좋고, 같은 등수면
  // 최근 것을 쓴다.
  const best = hits.reduce<ReplayHit | null>(
    (top, hit) => (!top || hit.rank < top.rank ? hit : top),
    null,
  );

  return {
    roundsPlayed: draws.length,
    from: draws.length ? from : 0,
    to: draws.length ? to : 0,
    hits,
    rankCounts,
    prizeByRank,
    unknownByRank,
    prizeUnknownCount: Object.values(unknownByRank).reduce((sum, count) => sum + count, 0),
    totalPrize: Object.values(prizeByRank).reduce((sum, won) => sum + won, 0),
    best,
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
