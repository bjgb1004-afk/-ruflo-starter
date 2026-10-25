import { describeFiguresAsOf, formatAsOfDate } from "./describeAsOf";

describe("formatAsOfDate", () => {
  // 동행복권 실측 변경일. 전부 금요일이라는 사실 자체가 이 기능의 전제다.
  it.each(["2026-10-23", "2026-10-16", "2026-10-02", "2026-09-04", "2026-07-03"])(
    "%s 는 금요일로 읽는다",
    (iso) => {
      expect(formatAsOfDate(iso)).toContain("(금)");
    },
  );

  it("월·일을 0 없이 쓴다", () => {
    expect(formatAsOfDate("2026-10-23")).toBe("10월 23일(금)");
    expect(formatAsOfDate("2026-07-03")).toBe("7월 3일(금)");
  });

  it("날짜가 아니면 null", () => {
    expect(formatAsOfDate(null)).toBeNull();
    expect(formatAsOfDate("26-10-23")).toBeNull();
    expect(formatAsOfDate("")).toBeNull();
  });
});

describe("describeFiguresAsOf", () => {
  it("문구의 요일이 날짜의 요일과 같다", () => {
    const sentence = describeFiguresAsOf("2026-10-23");
    expect(sentence).toContain("10월 23일(금)");
    expect(sentence).toContain("보통 매주 금요일에 갱신");
  });

  // 동행복권은 1억 이상 고액 당첨 지급 완료 건을 당일 추가 반영할 수 있다. "한 번만
  // 갱신"이라고 써두면 유저가 이미 1등이 나간 회차를 안심하고 사러 간다.
  it("주 1회로 못박지 않는다 - 주중 변동 가능성을 말한다", () => {
    const sentence = describeFiguresAsOf("2026-10-23") ?? "";
    expect(sentence).not.toContain("한 번만");
    expect(sentence).toContain("주중에도 바뀔 수 있어요");
  });

  it("요일을 박아두지 않는다 - 수요일 날짜면 수요일로 말한다", () => {
    expect(describeFiguresAsOf("2026-10-21")).toContain("보통 매주 수요일에 갱신");
  });

  it("날짜가 없으면 각주를 만들지 않는다", () => {
    expect(describeFiguresAsOf(null)).toBeNull();
  });
});
