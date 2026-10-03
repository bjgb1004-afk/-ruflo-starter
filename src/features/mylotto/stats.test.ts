import { computeVaultSummary } from "./stats";
import type { MyLottoTicket } from "./useMyLottoTickets";

// 수익률에 안 산 번호가 섞이면 쓰지 않은 돈이 구매액에 들어가고, 받지도 않은 당첨금이 더해진다.
function ticket(over: Partial<MyLottoTicket>): MyLottoTicket {
  return {
    id: Math.random().toString(36),
    drawNo: 1244,
    savedAt: "2026-10-03T00:00:00.000Z",
    numbers: [1, 2, 3, 4, 5, 6],
    purchaseType: null,
    checked: true,
    rank: null,
    prizeAmount: 0,
    ...over,
  };
}

describe("computeVaultSummary", () => {
  it("저장만 한 번호는 구매액·당첨금에서 빼고 따로 센다", () => {
    const s = computeVaultSummary([
      ticket({ purchased: true, rank: 5, prizeAmount: 5000 }),
      ticket({ purchased: true }),
      ticket({ purchased: false, rank: 5, prizeAmount: 5000 }),
    ]);
    expect(s.totalTickets).toBe(2);
    expect(s.totalSpent).toBe(2000);
    expect(s.totalWon).toBe(5000);
    expect(s.winCount).toBe(1);
    expect(s.savedOnlyTickets).toBe(1);
  });

  it("purchased가 없는 구버전 티켓은 산 것으로 센다", () => {
    const s = computeVaultSummary([ticket({}), ticket({})]);
    expect(s.totalTickets).toBe(2);
    expect(s.totalSpent).toBe(2000);
    expect(s.savedOnlyTickets).toBe(0);
  });

  it("산 복권이 하나도 없으면 구매액이 0이다", () => {
    const s = computeVaultSummary([ticket({ purchased: false }), ticket({ purchased: false })]);
    expect(s.totalTickets).toBe(0);
    expect(s.totalSpent).toBe(0);
    expect(s.savedOnlyTickets).toBe(2);
  });
});
