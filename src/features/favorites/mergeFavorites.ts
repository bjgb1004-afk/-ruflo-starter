export type FavoriteStore = { id: string; name: string; address: string };

// pendingDeletes에 있는 id(로컬에서 지웠지만 클라우드 삭제가 아직 실패/미완료인 항목)는
// 클라우드 병합에서 제외해, 지운 즐겨찾기가 재시작 시 되살아나지 않게 한다.
export function mergeFavorites(
  current: Record<string, FavoriteStore>,
  cloudStores: FavoriteStore[],
  pendingDeletes: string[],
): Record<string, FavoriteStore> {
  const next = { ...current };
  for (const store of cloudStores) {
    if (pendingDeletes.includes(store.id)) continue;
    next[store.id] = store;
  }
  return next;
}
