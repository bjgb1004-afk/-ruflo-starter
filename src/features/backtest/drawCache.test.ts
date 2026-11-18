import { mergeDraws } from "./drawCache";
import type { LottoDraw } from "./types";

const draw = (round: number, first = 1): LottoDraw => ({
  round,
  numbers: [first, 11, 22, 28, 34, 45],
  bonus: 7,
});

describe("mergeDraws", () => {
  it("저장분이 없으면 받은 것을 회차순으로 돌려준다", () => {
    expect(mergeDraws([], [draw(3), draw(1), draw(2)]).map((d) => d.round)).toEqual([1, 2, 3]);
  });

  it("저장분 뒤에 새 회차를 이어붙인다", () => {
    expect(mergeDraws([draw(1), draw(2)], [draw(3)]).map((d) => d.round)).toEqual([1, 2, 3]);
  });

  it("같은 회차는 새로 받은 쪽으로 덮는다 - 1등 금액이 나중에 채워지는 회차가 있다", () => {
    const merged = mergeDraws([draw(1, 1)], [draw(1, 9)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].numbers[0]).toBe(9);
  });

  it("빈 수신분은 저장분을 그대로 둔다", () => {
    expect(mergeDraws([draw(1), draw(2)], []).map((d) => d.round)).toEqual([1, 2]);
  });
});
