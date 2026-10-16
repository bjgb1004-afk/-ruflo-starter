import { buildGrid, findMatch, nameSimilarity, type StoreRow } from "./storeMatcher";

const store = (id: string, name: string, latitude: number, longitude: number): StoreRow => ({
  id,
  name,
  latitude,
  longitude,
  phone: null,
});

describe("nameSimilarity", () => {
  it("표기만 다른 같은 가게는 높게 본다", () => {
    expect(nameSimilarity("풍전수퍼", "풍전슈퍼")).toBe(1);
    expect(nameSimilarity("GS25(구로제일)", "GS25(구로제일점)")).toBe(1);
    expect(nameSimilarity("황금복권", "황금복권방")).toBeGreaterThanOrEqual(0.6);
    expect(nameSimilarity("빙그레 돈벼락 맞는곳", "돈벼락맞는곳")).toBeGreaterThanOrEqual(0.6);
  });

  // 실측 회귀: 글자 집합 Jaccard였던 예전 구현은 이 쌍을 0.5 넘게 봐서, 1등 11회인
  // 황성점의 실적이 역전점에 붙고 황성점은 0회로 남았다.
  it("이름이 다른 가게는 낮게 본다", () => {
    expect(nameSimilarity("로또복권황성점", "로또복권역전점")).toBeLessThan(0.6);
    expect(nameSimilarity("포시즌마전점", "포시즌검암점")).toBeLessThan(0.6);
  });
});

describe("findMatch", () => {
  const index = buildGrid([
    store("a", "로또복권역전점", 37.5, 127.0),
    store("b", "스파", 37.6617, 127.0579),
  ]);

  it("이름이 다르면 반경 안에 있어도 붙이지 않는다", () => {
    // 200m 안이지만 이름이 다른 가게 - 60m 유일후보 예외에도 안 걸린다.
    expect(findMatch({ storeName: "로또복권황성점", latitude: 37.5009, longitude: 127.0009 }, index)).toBeNull();
  });

  it("상호가 바뀐 가게는 아주 가까운 유일 후보로 붙인다", () => {
    const matched = findMatch({ storeName: "완전히다른이름", latitude: 37.66172, longitude: 127.05792 }, index);
    expect(matched?.id).toBe("b");
  });

  it("반경을 벗어나면 붙이지 않는다", () => {
    expect(findMatch({ storeName: "스파", latitude: 37.68, longitude: 127.08 }, index)).toBeNull();
  });
});
