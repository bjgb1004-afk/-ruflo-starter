import { parseStock, parseShortDate, toSpittoRoundRow } from "./parseSpittoRow";

describe("스피또 수량 문자열 쪼개기", () => {
  // 가장 중요한 한 줄. 앞이 잔여다 - 거꾸로 읽으면 "1등 8장 남음"이 "8장 다 나감"이 된다.
  it("앞을 잔여, 뒤를 전체로 읽는다", () => {
    expect(parseStock("3매/10매")).toEqual({ remaining: 3, total: 10 });
  });

  it("아직 아무것도 안 나간 회차는 잔여와 전체가 같다", () => {
    expect(parseStock("8매/8매")).toEqual({ remaining: 8, total: 8 });
  });

  it("다 나간 회차는 잔여 0", () => {
    expect(parseStock("0매/6매")).toEqual({ remaining: 0, total: 6 });
  });

  it("콤마가 섞여도 읽는다", () => {
    expect(parseStock("1,200매/2,000매")).toEqual({ remaining: 1200, total: 2000 });
  });

  it("모양이 다르면 추측하지 않고 버린다", () => {
    for (const bad of [null, undefined, "", "8매", "미정", "a/b", "8/9/10"]) {
      expect(parseStock(bad as string)).toEqual({ remaining: null, total: null });
    }
  });

  // 잔여가 전체보다 크면 우리가 앞뒤를 거꾸로 읽고 있다는 신호다. 그 경우 숫자를 쓰지 않는다.
  it("잔여가 전체보다 많으면 해석이 틀린 것으로 보고 버린다", () => {
    expect(parseStock("10매/8매")).toEqual({ remaining: null, total: null });
  });
});

describe("기준일 두 자리 연도", () => {
  it("26-10-16을 2026-10-16으로 읽는다", () => {
    expect(parseShortDate("26-10-16")).toBe("2026-10-16");
  });

  it("모양이 다르면 null", () => {
    for (const bad of [null, "2026-10-16", "26/10/16", "26-13-01", "26-10-00"]) {
      expect(parseShortDate(bad as string)).toBeNull();
    }
  });
});

describe("응답 한 줄을 DB 한 행으로", () => {
  // 2026-10-22 실측 응답 그대로.
  const row = {
    ntslStatus: "판매중",
    stGmTypeCd: "SP2000",
    stGmTypeNm: "스피또2000",
    stEpsd: 70,
    stSpmtRt: 20,
    stNtslAmt: 2000,
    stRnk1Rt: "8매/8매",
    stRnk2Rt: "23매/24매",
    rnk1Atm: "10억원",
    stNtslEndDt: "2026-12-31",
    stGiveEndDt: "2027-12-31",
    stMainImgStrgPathNm: "/img/board/content/202609/S2000_70.png",
    dataChgDt: "26-10-16",
  };

  it("실측 응답을 그대로 옮긴다", () => {
    expect(toSpittoRoundRow(row)).toEqual({
      game_type: "SP2000",
      round_no: 70,
      game_name: "스피또2000",
      status: "판매중",
      stock_rate: 20,
      rank1_remaining: 8,
      rank1_total: 8,
      rank2_remaining: 23,
      rank2_total: 24,
      rank1_prize: "10억원",
      price: 2000,
      sale_end_date: "2026-12-31",
      claim_end_date: "2027-12-31",
      image_path: "/img/board/content/202609/S2000_70.png",
      figures_as_of: "2026-10-16",
    });
  });

  it("종류나 회차가 없는 줄은 건너뛴다", () => {
    expect(toSpittoRoundRow({ ...row, stGmTypeCd: undefined })).toBeNull();
    expect(toSpittoRoundRow({ ...row, stEpsd: undefined })).toBeNull();
  });

  it("수량이 비어 있어도 회차 자체는 저장한다", () => {
    const parsed = toSpittoRoundRow({ ...row, stRnk1Rt: null, stSpmtRt: null });
    expect(parsed).toMatchObject({ round_no: 70, rank1_remaining: null, stock_rate: null });
  });
});
