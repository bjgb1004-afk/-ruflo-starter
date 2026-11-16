jest.mock("@/lib/supabase", () => ({ supabase: {} }));

import { roundToRefetchFrom } from "./backtestDrawsApi";
import type { LottoDraw } from "@/features/backtest/types";

const draw = (round: number, prizeKnown: boolean): LottoDraw => ({
  round,
  numbers: [1, 11, 22, 28, 34, 45],
  prizePerWin: prizeKnown ? { 1: 1_000_000_000 } : {},
});

describe("roundToRefetchFrom", () => {
  it("캐시가 없으면 0부터 전체를 받는다", () => {
    expect(roundToRefetchFrom([])).toBe(0);
  });

  it("최근 회차 금액이 다 채워져 있으면 마지막 회차 그대로", () => {
    const cached = [draw(1248, true), draw(1249, true), draw(1250, true)];
    expect(roundToRefetchFrom(cached)).toBe(1250);
  });

  it("추첨 직후라 금액이 안 붙은 최근 회차는 그 회차부터 다시 받는다", () => {
    const cached = [draw(1248, true), draw(1249, true), draw(1250, false)];
    expect(roundToRefetchFrom(cached)).toBe(1249);
  });

  it("금액 없는 회차가 몇 주 전부터 캐시에 박혀 있어도 거기서부터 다시 받는다", () => {
    const cached = [draw(1248, true), draw(1249, false), draw(1250, false)];
    expect(roundToRefetchFrom(cached)).toBe(1248);
  });

  it("최근 창(10회차) 밖의 옛 영구 결측 회차는 건드리지 않는다", () => {
    const cached = [draw(463, false), ...Array.from({ length: 10 }, (_, i) => draw(1241 + i, true))];
    expect(roundToRefetchFrom(cached)).toBe(1250);
  });
});
