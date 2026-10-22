import { describeStock, shouldSuggestCall, LOW_STOCK_RATE } from "./describeStock";

describe("입고율 문장", () => {
  // 2026-10-22 실측값들.
  it("입고율이 낮으면 몇 곳 중 1곳인지 계산해 알려준다", () => {
    expect(describeStock(20)).toBe("복권가게 5곳 중 1곳에만 들어왔어요 (입고율 20%)");
    expect(describeStock(55)).toBe("복권가게 2곳 중 1곳에만 들어왔어요 (입고율 55%)");
  });

  it("거의 다 깔린 회차는 곳 수를 안 센다", () => {
    expect(describeStock(98)).toBe("거의 모든 복권가게에 있어요 (입고율 98%)");
    expect(describeStock(100)).toBe("거의 모든 복권가게에 있어요 (입고율 100%)");
  });

  // 한 번 실제로 났던 버그. 0으로 나눠 "Infinity곳 중 1곳"이 떴다.
  it("입고율 0을 0으로 나누지 않는다", () => {
    expect(describeStock(0)).toBe("아직 복권가게에 안 들어왔어요");
    expect(describeStock(-1)).toBe("아직 복권가게에 안 들어왔어요");
    expect(describeStock(Number.NaN)).toBe("아직 복권가게에 안 들어왔어요");
  });

  // 50~59%는 100/55 = 1.8 -> round 2. 1로 내려가면 "1곳 중 1곳" = 전부 있다는 뜻이 되어
  // 정반대가 된다. ("11곳 중 1곳"은 정상이므로 글자 포함이 아니라 앞자리를 봐야 한다.)
  it("'복권가게 1곳 중 1곳'이라고는 절대 쓰지 않는다", () => {
    for (let rate = 1; rate < LOW_STOCK_RATE; rate++) {
      expect(describeStock(rate)).not.toContain("복권가게 1곳 중");
    }
  });

  it("덜 깔린 회차는 항상 2곳 이상으로 센다", () => {
    for (let rate = 1; rate < LOW_STOCK_RATE; rate++) {
      const perOne = Number(describeStock(rate).match(/복권가게 (\d+)곳/)?.[1]);
      expect(perOne).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("전화 확인 안내를 띄울지", () => {
  it("덜 깔린 회차에만 띄운다", () => {
    expect(shouldSuggestCall(20)).toBe(true);
    expect(shouldSuggestCall(55)).toBe(true);
  });

  it("거의 다 깔렸으면 띄우지 않는다", () => {
    expect(shouldSuggestCall(98)).toBe(false);
    expect(shouldSuggestCall(100)).toBe(false);
  });

  // 어느 가게에도 없으면 전화해봐도 소용없다.
  it("아예 안 들어온 회차에는 띄우지 않는다", () => {
    expect(shouldSuggestCall(0)).toBe(false);
    expect(shouldSuggestCall(null)).toBe(false);
  });
});
