import { computeHomeResult, nextDrawLabel } from "./homeResult";
import type { MyLottoTicket } from "./useMyLottoTickets";

function ticket(over: Partial<MyLottoTicket>): MyLottoTicket {
  return {
    id: Math.random().toString(36),
    drawNo: 1251,
    savedAt: "2026-11-21T00:00:00.000Z",
    numbers: [1, 2, 3, 4, 5, 6],
    purchaseType: null,
    checked: true,
    rank: null,
    prizeAmount: 0,
    purchased: true,
    ...over,
  };
}

describe("computeHomeResult", () => {
  it("대조가 끝나지 않은 티켓이 섞여 있으면 낙첨이라고 하지 않는다", () => {
    const r = computeHomeResult([ticket({ rank: null }), ticket({ checked: false })], 1251);
    expect(r).toEqual({ kind: "checking", count: 2 });
  });

  it("가장 높은 등수와 그 등수 장수, 전체 당첨금을 함께 돌려준다", () => {
    const r = computeHomeResult(
      [
        ticket({ rank: 5, prizeAmount: 5000 }),
        ticket({ rank: 4, prizeAmount: 50000 }),
        ticket({ rank: 4, prizeAmount: 50000 }),
      ],
      1251,
    );
    expect(r).toEqual({ kind: "won", rank: 4, count: 2, totalPrize: 105000 });
  });

  it("최신 회차 번호가 없고 다음 회차를 미리 찍어뒀으면 그 회차를 대기로 보여준다", () => {
    const r = computeHomeResult([ticket({ drawNo: 1252, checked: false }), ticket({ drawNo: 1253, checked: false })], 1251);
    expect(r).toEqual({ kind: "waiting", drawNo: 1252, count: 1 });
  });

  it("아무 번호도 없으면 none", () => {
    expect(computeHomeResult([], 1251)).toEqual({ kind: "none" });
  });

  it("모두 대조됐고 당첨이 없으면 낙첨", () => {
    expect(computeHomeResult([ticket({}), ticket({})], 1251)).toEqual({ kind: "lost", count: 2 });
  });
});

describe("nextDrawLabel", () => {
  // 1251회 추첨일 2026-11-21(토) -> 다음 추첨은 2026-11-28(토)
  it("한국시간 기준으로 남은 날짜를 센다 (UTC로 세면 하루 밀린다)", () => {
    // 2026-11-27 23:00 KST = 2026-11-27T14:00Z
    expect(nextDrawLabel("2026-11-21", 1251, new Date("2026-11-27T14:00:00Z"))).toBe("1252회는 내일 추첨이에요");
  });

  it("추첨일 당일", () => {
    expect(nextDrawLabel("2026-11-21", 1251, new Date("2026-11-28T05:00:00Z"))).toBe("1252회는 오늘 밤 추첨이에요");
  });

  it("추첨은 끝났는데 서버 반영이 늦으면 결과 대기로 말한다", () => {
    expect(nextDrawLabel("2026-11-21", 1251, new Date("2026-11-28T12:00:00Z"))).toBe("1252회 결과를 기다리고 있어요");
  });

  it("여러 날 남은 경우", () => {
    expect(nextDrawLabel("2026-11-21", 1251, new Date("2026-11-24T01:00:00Z"))).toBe("1252회는 4일 뒤 추첨이에요");
  });
});
