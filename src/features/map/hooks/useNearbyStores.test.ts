jest.mock("@/lib/supabase", () => ({ supabase: { rpc: () => ({}) } }));

import { roundForCacheKey } from "./useNearbyStores";

describe("roundForCacheKey", () => {
  it("GPS 측정 오차 수준(수 미터)의 흔들림은 같은 키로 뭉친다", () => {
    expect(roundForCacheKey(37.5012345)).toBe(roundForCacheKey(37.5012789));
  });

  it("실제로 다른 곳(약 110m 이상)은 다른 키가 된다", () => {
    expect(roundForCacheKey(37.5012345)).not.toBe(roundForCacheKey(37.5023345));
  });
});
