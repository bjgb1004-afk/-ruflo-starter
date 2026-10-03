// 뽑기 권한 규칙만 검사한다. 광고 모듈(네이티브)과 광고 스위치는 가짜로 바꾼다.
jest.mock("@/features/ads/config", () => ({ shouldGateWithRewardedAd: () => true }));
jest.mock("@/features/ads/showRewardedAd", () => ({ showRewardedAd: jest.fn() }));

import { showRewardedAd } from "@/features/ads/showRewardedAd";
import { needsAdForDraw, requestDraw } from "./requestDraw";
import { PASS_DURATION_MS, useDrawCredits } from "./useDrawCredits";

const mockShow = showRewardedAd as jest.MockedFunction<typeof showRewardedAd>;
const DRAW = 1244;

beforeEach(() => {
  useDrawCredits.setState({ drawNo: 0, usedFree: [], passUntil: 0 });
  mockShow.mockReset();
});

it("버튼마다 한 회차에 한 번은 공짜다", async () => {
  expect(await requestDraw("gauss", DRAW)).toBe("free");
  expect(await requestDraw("band", DRAW)).toBe("free");
  // 같은 버튼 두 번째는 공짜가 아니다 - 광고를 부른다.
  mockShow.mockResolvedValue("unavailable");
  expect(await requestDraw("gauss", DRAW)).toBe("ad-unavailable");
  expect(mockShow).toHaveBeenCalledTimes(1);
});

it("회차가 바뀌면 공짜가 되살아난다", async () => {
  expect(await requestDraw("gauss", DRAW)).toBe("free");
  expect(await requestDraw("gauss", DRAW + 1)).toBe("free");
  expect(useDrawCredits.getState().usedFree).toEqual(["gauss"]);
});

it("광고를 끝까지 보면 5분 동안 버튼 여섯 개가 전부 무제한이다", async () => {
  await requestDraw("gauss", DRAW); // 공짜 소진
  mockShow.mockResolvedValue("earned");

  expect(await requestDraw("gauss", DRAW)).toBe("rewarded");
  expect(useDrawCredits.getState().passUntil).toBeGreaterThan(Date.now() + PASS_DURATION_MS - 5_000);

  // 패스 중에는 다른 버튼까지 광고를 더 부르지 않는다.
  expect(await requestDraw("gauss", DRAW)).toBe("pass");
  expect(await requestDraw("euler", DRAW)).toBe("pass");
  expect(mockShow).toHaveBeenCalledTimes(1);
});

it("광고를 못 띄우면 그냥 주되 5분은 열어주지 않는다", async () => {
  await requestDraw("band", DRAW); // 공짜 소진
  mockShow.mockResolvedValue("unavailable");

  expect(await requestDraw("band", DRAW)).toBe("ad-unavailable");
  expect(useDrawCredits.getState().passUntil).toBe(0);
  // 다음에 또 눌러도 매번 광고를 시도한다(재고가 돌아올 수 있다).
  expect(await requestDraw("band", DRAW)).toBe("ad-unavailable");
  expect(mockShow).toHaveBeenCalledTimes(2);
});

it("패스가 끝나면 다시 광고를 요구한다", async () => {
  await requestDraw("gauss", DRAW);
  useDrawCredits.setState({ passUntil: Date.now() - 1 });
  mockShow.mockResolvedValue("unavailable");
  expect(await requestDraw("gauss", DRAW)).toBe("ad-unavailable");
});

it("버튼 문구는 광고를 보게 될 때만 바뀐다", () => {
  const fresh = useDrawCredits.getState();
  expect(needsAdForDraw(fresh, "gauss", DRAW)).toBe(false);

  useDrawCredits.setState({ drawNo: DRAW, usedFree: ["gauss"] });
  expect(needsAdForDraw(useDrawCredits.getState(), "gauss", DRAW)).toBe(true);
  expect(needsAdForDraw(useDrawCredits.getState(), "euler", DRAW)).toBe(false);

  useDrawCredits.setState({ passUntil: Date.now() + PASS_DURATION_MS });
  expect(needsAdForDraw(useDrawCredits.getState(), "gauss", DRAW)).toBe(false);
});
