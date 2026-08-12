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

  it("기존 로컬 항목은 유지한 채 클라우드 항목을 합친다", () => {
    const current = { b: storeB };
    const result = mergeFavorites(current, [storeA], []);
    expect(result).toEqual({ a: storeA, b: storeB });
  });
});
