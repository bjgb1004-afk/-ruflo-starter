import { normalizeMirrorDraw, prizeColumns, type MirrorDrawResponse } from "./mirrorDraw";

// 1250회 실측 응답 두 벌(2026-11-14). 20:43 = 번호만, 20:49 = 배당까지.
const numbersOnly = {
  draw_no: 1250,
  numbers: [1, 5, 18, 23, 27, 28],
  bonus_no: 8,
  date: "2026-11-14T00:00:00Z",
  divisions: [{}, {}, {}, {}, {}],
} as MirrorDrawResponse;

const announced: MirrorDrawResponse = {
  draw_no: 1250,
  numbers: [1, 5, 18, 23, 27, 28],
  bonus_no: 8,
  date: "2026-11-14T00:00:00Z",
  divisions: [
    { prize: 3103164459, winners: 9 },
    { prize: 46547467, winners: 100 },
    { prize: 1491906, winners: 3120 },
    { prize: 50000, winners: 156721 },
    { prize: 5000, winners: 2658318 },
  ],
  total_sales_amount: 116731227000,
};

describe("미러 응답 정규화", () => {
  it("배당이 아직 없어도 당첨번호는 그대로 준다", () => {
    const draw = normalizeMirrorDraw(numbersOnly);
    expect(draw).not.toBeNull();
    expect(draw!.numbers).toEqual([1, 5, 18, 23, 27, 28]);
    expect(draw!.bnusNo).toBe(8);
    expect(draw!.drwNoDate).toBe("2026-11-14");
    // 배당은 "아직 집계 중" - 0이나 undefined가 아니라 null이어야 한다. 그래야 저장할 때
    // 배당 칸을 아예 건드리지 않고, 화면이 "집계 중..."을 띄울 수 있다.
    expect(draw!.prizes).toBeNull();
  });

  it("배당이 일부만 붙은 것도 집계 중으로 본다", () => {
    const partial = { ...announced, divisions: [announced.divisions[0], {}, {}, {}, {}] };
    expect(normalizeMirrorDraw(partial)!.prizes).toBeNull();
  });

  it("배당이 다 붙으면 1~5등 금액·당첨자를 그대로 옮긴다", () => {
    const prizes = normalizeMirrorDraw(announced)!.prizes!;
    expect(prizes.firstPrizeAmountPerWin).toBe(3103164459);
    expect(prizes.firstPrizeWinnerCount).toBe(9);
    expect(prizes.firstPrizeTotalAmount).toBe(3103164459 * 9);
    expect(prizes.fifthPrizeWinnerCount).toBe(2658318);
    expect(prizeColumns(prizes).total_sales_amount).toBe(116731227000);
  });

  it("번호가 6개가 아니면 아직 발표 전으로 본다", () => {
    expect(normalizeMirrorDraw({ ...numbersOnly, numbers: [] })).toBeNull();
  });
});
