import { nextWeekdayAt } from "./nextWeekdayAt";

// 요일 계산은 off-by-one이 나기 쉽고, 틀리면 알림이 영원히 안 울리거나 엉뚱한 날 울린다.
// 요일·시각을 양쪽 다 못박는다. (금요일 19시 기준 - nextFridayEvening과 같은 값으로 검증)
describe("다음 요일 시각 계산", () => {
  const at = (iso: string) => new Date(iso);
  const FRI = 5;
  const HOUR_19 = 19;

  it("주중이면 이번 주 그 요일 그 시각", () => {
    // 2026-10-20은 화요일
    const result = nextWeekdayAt(FRI, HOUR_19, at("2026-10-20T10:00:00"));
    expect(result.getDay()).toBe(5);
    expect(result.getHours()).toBe(19);
    expect(result.getDate()).toBe(23);
  });

  it("그 요일 그 시각 전이면 오늘 그 시각", () => {
    const result = nextWeekdayAt(FRI, HOUR_19, at("2026-10-23T09:00:00"));
    expect(result.getDate()).toBe(23);
    expect(result.getHours()).toBe(19);
  });

  // 가장 틀리기 쉬운 자리. 이미 지난 시각으로 예약하면 알림이 아예 안 울린다.
  it("그 시각을 지났으면 다음 주 그 요일", () => {
    const result = nextWeekdayAt(FRI, HOUR_19, at("2026-10-23T20:00:00"));
    expect(result.getDay()).toBe(5);
    expect(result.getDate()).toBe(30);
  });

  it("그 시각 정각이면 다음 주로 넘긴다", () => {
    const result = nextWeekdayAt(FRI, HOUR_19, at("2026-10-23T19:00:00"));
    expect(result.getDate()).toBe(30);
  });

  it("언제 불러도 미래다", () => {
    for (const iso of [
      "2026-10-19T00:00:00",
      "2026-10-23T18:59:59",
      "2026-10-23T19:00:01",
      "2026-10-25T12:00:00",
      "2026-12-31T23:59:00",
    ]) {
      const from = at(iso);
      expect(nextWeekdayAt(FRI, HOUR_19, from).getTime()).toBeGreaterThan(from.getTime());
    }
  });

  it("다른 요일·시각 조합도 동일하게 계산된다(일요일 10시)", () => {
    // 2026-10-24는 토요일
    const result = nextWeekdayAt(0, 10, at("2026-10-24T21:00:00"));
    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(25);
    expect(result.getHours()).toBe(10);
  });
});
