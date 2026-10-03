import { LOTTO_UNIT_PRICE, isPurchased, type MyLottoTicket } from "./useMyLottoTickets";

export interface VaultSummary {
  totalTickets: number;
  totalSpent: number;
  totalWon: number;
  winCount: number;
  /** 아직 사지 않고 번호만 저장해둔 게임 수. 위 네 값에는 들어가지 않는다. */
  savedOnlyTickets: number;
}

// 수익률은 **실제로 산 것만** 센다. 생성기나 놓친 당첨금 화면에서 저장해둔 번호를 같이 세면
// 쓰지 않은 돈이 구매액에 들어가 수익률이 실제보다 나쁘게 나오고, 그 번호가 "당첨"으로
// 잡히면 받지도 않은 당첨금이 더해진다.
export function computeVaultSummary(tickets: MyLottoTicket[]): VaultSummary {
  const bought = tickets.filter(isPurchased);
  return {
    totalTickets: bought.length,
    totalSpent: bought.length * LOTTO_UNIT_PRICE,
    totalWon: bought.reduce((sum, t) => sum + t.prizeAmount, 0),
    winCount: bought.filter((t) => t.rank !== null).length,
    savedOnlyTickets: tickets.length - bought.length,
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
