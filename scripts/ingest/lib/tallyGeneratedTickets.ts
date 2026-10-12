// "앱에서 나간 번호"를 한 회차 당첨번호에 대입해 코너별 성적을 센다. DB를 모르는 순수 함수라
// 테스트에서 그대로 부를 수 있다(집계 배치는 이 함수에 행만 먹인다).
//
// 등수 판정과 당첨금은 앱 화면과 같은 코드를 쓴다 - src/features/backtest.
import { countMatches, rankOf } from "../../../src/features/backtest/engine";
import { prizeOf, type HitRank } from "../../../src/features/backtest/replay";
import { KOREA_LOTTO_6_45, type LottoDraw, type LottoRule } from "../../../src/features/backtest/types";

export interface GeneratedTicketRow {
  source: string;
  numbers: number[];
}

export interface SourceStat {
  games: number;
  rank: Record<HitRank, number>;
  /** 1인당 금액을 아는 등수만 더한 합계(원). */
  prizeTotal: number;
  /** 금액이 공개되지 않아 prizeTotal에 못 넣은 건수. 0원과 섞으면 "1등 0원"이 찍힌다. */
  prizeUnknown: number;
}

export function emptyStat(): SourceStat {
  return { games: 0, rank: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, prizeTotal: 0, prizeUnknown: 0 };
}

export function tallyGeneratedTickets(
  tickets: readonly GeneratedTicketRow[],
  draw: LottoDraw,
  rule: LottoRule = KOREA_LOTTO_6_45,
): Map<string, SourceStat> {
  const bySource = new Map<string, SourceStat>();
  for (const ticket of tickets) {
    let stat = bySource.get(ticket.source);
    if (!stat) {
      stat = emptyStat();
      bySource.set(ticket.source, stat);
    }
    stat.games += 1;

    const matchCount = countMatches(ticket.numbers, draw.numbers);
    const hasBonus = draw.bonus != null && ticket.numbers.includes(draw.bonus);
    const rank = rankOf(matchCount, hasBonus, rule);
    if (rank === null) continue;
    stat.rank[rank] += 1;
    const prize = prizeOf(rank, draw);
    if (prize === null) stat.prizeUnknown += 1;
    else stat.prizeTotal += prize;
  }
  return bySource;
}
