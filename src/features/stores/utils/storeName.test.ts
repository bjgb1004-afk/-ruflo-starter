import { displayStoreName } from "./storeName";

describe("displayStoreName", () => {
  it("제대로 된 상호는 그대로 둔다", () => {
    expect(displayStoreName("천하명당복권방독산점", "서울특별시 금천구 독산로85길 16")).toBe("천하명당복권방독산점");
  });

  it("일반명이면 도로명을 붙여 구분한다", () => {
    expect(displayStoreName("복권방", "경기도 하남시 신장로 122")).toBe("복권방 신장로");
    expect(displayStoreName("동행복권", "서울특별시 금천구 독산로 171 다복타운")).toBe("동행복권 독산로");
  });

  it("'상호없음' 표기는 이름을 버리고 주소로 부른다", () => {
    // 이런 집은 대개 거리 가판대라 간판 상호가 아예 없다(거리뷰 확인).
    expect(displayStoreName("상호없음", "서울특별시 금천구 남부순환로 1390 전영수내과의원 가판")).toBe(
      "남부순환로 1390",
    );
    expect(displayStoreName("(없음)", "충청북도 청주시 상당구 무농정로 10-1")).toBe("무농정로 10-1");
    expect(displayStoreName("없음", "서울특별시 강남구 강남대로84길 23")).toBe("강남대로84길 23");
  });

  it("주소에서 건물명까지 끌고 오지 않는다", () => {
    expect(displayStoreName("상호없음", "부산광역시 중구 대청로 95 담배포")).toBe("대청로 95");
  });

  it("괄호로 시작해도 구분되는 이름은 그대로 둔다", () => {
    expect(displayStoreName("(I.A) 로또마트", "경기도 안산시 단원구 신길로 9-4")).toBe("(I.A) 로또마트");
    expect(displayStoreName("(개롱역)복 노다지", "서울특별시 송파구 오금로44가길 12")).toBe("(개롱역)복 노다지");
  });

  it("3단계 행정구역에서도 도로명만 집는다", () => {
    expect(displayStoreName("로또", "경기도 성남시 분당구 판교역로 240")).toBe("로또 판교역로");
  });

  it("지번 주소면 동 이름을 쓴다", () => {
    expect(displayStoreName("복권방", "서울 금천구 독산동 1012-15")).toBe("복권방 독산동");
  });

  it("붙일 게 없으면 이름만 남긴다", () => {
    expect(displayStoreName("복권방", "")).toBe("복권방");
    expect(displayStoreName("복권방", null)).toBe("복권방");
  });

  it("이름이 비어도 터지지 않는다", () => {
    expect(displayStoreName(null, "경기도 하남시 신장로 122")).toBe("");
  });
});
