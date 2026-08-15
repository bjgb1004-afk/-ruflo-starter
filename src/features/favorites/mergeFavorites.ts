export type FavoriteStore = { id: string; name: string; address: string };

// 클라우드를 진실의 원천으로 삼아 로컬 상태를 완전히 대체한다(예전엔 {...current, ...cloud}로
// 합치기만 해서, 다른 기기에서 삭제한 즐겨찾기가 이 기기에서는 절대 안 사라지고 계속
// 클라우드로 재업로드되는 버그가 있었다). 게스트 상태에서 추가해 아직 클라우드에 없는
// 항목은 이 함수 호출 전에 먼저 업로드해서 cloudStores에 포함시켜야 한다
// (useFavoritesCloudSync.ts 참고) - 그래야 여기서 사라지지 않는다.
// pendingDeletes(로컬에서 지웠지만 클라우드 삭제가 아직 실패/미완료인 항목)는 혹시
// cloudStores에 아직 남아있더라도 병합 결과에서 제외해 되살아나지 않게 한다.
export function mergeFavorites(
  _current: Record<string, FavoriteStore>,
  cloudStores: FavoriteStore[],
  pendingDeletes: string[],
): Record<string, FavoriteStore> {
  const next: Record<string, FavoriteStore> = {};
  for (const store of cloudStores) {
    if (pendingDeletes.includes(store.id)) continue;
    next[store.id] = store;
  }
  return next;
}
