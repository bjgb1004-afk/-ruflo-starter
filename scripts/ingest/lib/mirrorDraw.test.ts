import { normalizeMirrorDraw, type MirrorDrawResponse } from "./mirrorDraw";

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
  it("배당이 아직 안 붙었으면 미발표로 본다", () => {
    expect(normalizeMirrorDraw(numbersOnly)).toBeNull();
  });

  it("배당이 일부만 붙은 것도 미발표로 본다", () => {
    const partial = { ...announced, divisions: [announced.divisions[0], {}, {}, {}, {}] };
    expect(normalizeMirrorDraw(partial)).toBeNull();
  });

  it("배당까지 다 붙으면 1~5등 금액·당첨자를 그대로 옮긴다", () => {
    const draw = normalizeMirrorDraw(announced);
    expect(draw).not.toBeNull();
    expect(draw!.firstPrizeAmountPerWin).toBe(3103164459);
    expect(draw!.firstPrizeWinnerCount).toBe(9);
    expect(draw!.firstPrizeTotalAmount).toBe(3103164459 * 9);
    expect(draw!.fifthPrizeWinnerCount).toBe(2658318);
    expect(draw!.drwNoDate).toBe("2026-11-14");
  });
});
