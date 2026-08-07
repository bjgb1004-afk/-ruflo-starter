import { LOTTO_UNIT_PRICE, type MyLottoTicket } from "./useMyLottoTickets";

export interface VaultSummary {
  totalTickets: number;
  totalSpent: number;
  totalWon: number;
  winCount: number;
}

export function computeVaultSummary(tickets: MyLottoTicket[]): VaultSummary {
  return {
    totalTickets: tickets.length,
    totalSpent: tickets.length * LOTTO_UNIT_PRICE,
    totalWon: tickets.reduce((sum, t) => sum + t.prizeAmount, 0),
    winCount: tickets.filter((t) => t.rank !== null).length,
  };
}

export interface NumberFrequency {
  number: number;
  count: number;
}

// 저장된 모든 티켓(당첨 여부 무관)의 번호 출현 빈도 상위 N개. 동률이면 작은 숫자를 우선한다.
export function computeFrequentNumbers(tickets: MyLottoTicket[], topN = 5): NumberFrequency[] {
  const counts = new Map<number, number>();
  for (const t of tickets) {
    for (const n of t.numbers) {
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count || a.number - b.number)
    .slice(0, topN);
}
