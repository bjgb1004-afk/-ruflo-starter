import { normalizeAddress } from "./addressNormalizer";

describe("normalizeAddress - 시/군/구 판정", () => {
  it("일반 주소는 두 번째 토큰을 시/군/구로 쓴다", () => {
    const r = normalizeAddress("서울 노원구 상계로 123");
    expect(r.sido).toBe("서울특별시");
    expect(r.sigungu).toBe("노원구");
  });

  it("세종처럼 시/군/구가 없는 곳은 도로명을 시/군/구로 삼지 않는다", () => {
    expect(normalizeAddress("세종특별자치시 한누리대로 2130").sigungu).toBeNull();
    expect(normalizeAddress("세종특별자치시 조치원읍 새내로 15").sigungu).toBeNull();
  });

  it("폐지·개칭된 지명은 현재 행정구역으로 보정한다", () => {
    expect(normalizeAddress("인천광역시 남구 도화동 80-83").sigungu).toBe("미추홀구");
    expect(normalizeAddress("인천광역시 검단구 서곶로 788").sigungu).toBe("서구");
    expect(normalizeAddress("경상남도 마산시 구암2동 85-1").sigungu).toBe("창원시");
  });

  it("군위군은 시/도까지 대구광역시로 바뀐다", () => {
    const r = normalizeAddress("경상북도 군위군 중앙길 75-2");
    expect(r.sido).toBe("대구광역시");
    expect(r.sigungu).toBe("군위군");
    expect(r.normalized).toBe("대구광역시 군위군 중앙길 75-2");
  });
});
