import { mergeFavorites, type FavoriteStore } from "./mergeFavorites";

const storeA: FavoriteStore = { id: "a", name: "A상회", address: "서울" };
const storeB: FavoriteStore = { id: "b", name: "B상회", address: "부산" };

describe("mergeFavorites", () => {
  it("클라우드에만 있는 항목을 로컬에 추가한다", () => {
    expect(mergeFavorites({}, [storeA], [])).toEqual({ a: storeA });
  });

  it("pendingDeletes에 있는 id는 클라우드 값이 있어도 되살리지 않는다", () => {
    // 오프라인 등으로 클라우드 삭제가 아직 실패한 상태 - 로컬에서 이미 지운 즐겨찾기가
    // 재로그인/재시작 시 다시 나타나던 버그의 재현 케이스.
    const current = {};
    const result = mergeFavorites(current, [storeA, storeB], ["a"]);
    expect(result).toEqual({ b: storeB });
  });

  it("클라우드를 진실의 원천으로 삼아 로컬에만 있던(다른 기기에서 지워진) 항목은 사라진다", () => {
    // 예전엔 {...current, ...cloud}로 단순 합집합이라, 다른 기기에서 삭제한 즐겨찾기가
    // 이 기기에서는 절대 안 사라지고 클라우드로 계속 재업로드되는 버그가 있었다.
    // 게스트 상태에서 추가해 아직 클라우드에 없는 항목은 useFavoritesCloudSync.ts가
    // 먼저 업로드해서 cloudStores에 포함시킨 뒤 이 함수를 호출하므로, 여기서는
    // "cloudStores에 없으면 최종 결과에도 없다"가 항상 맞는 동작이다.
    const current = { b: storeB };
    const result = mergeFavorites(current, [storeA], []);
    expect(result).toEqual({ a: storeA });
  });
});
