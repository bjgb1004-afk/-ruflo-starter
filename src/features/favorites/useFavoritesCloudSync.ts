import { useEffect, useRef } from "react";
import { reportError } from "@/lib/errorLog";
import { useAuth } from "@/features/auth/useAuth";
import { useFavorites } from "./useFavorites";
import { getCloudFavorites, addCloudFavorite } from "./favoritesApi";

// 로그인 시 1회: 클라우드 즐겨찾기를 로컬과 합치고, 로그인 전 로컬에만 있던
// 항목(게스트 상태에서 추가한 것)은 클라우드로 올려 보낸다.
export function useFavoritesCloudSync() {
  const userId = useAuth((s) => s.user?.id);
  const mergeCloud = useFavorites((s) => s.mergeCloud);
  const retryPendingDeletes = useFavorites((s) => s.retryPendingDeletes);
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || syncedUserId.current === userId) return;
    syncedUserId.current = userId;

    (async () => {
      try {
        // 지난번 앱 종료 전 클라우드 삭제가 실패했던 항목을 먼저 다시 시도한다 - 성공하면
        // pendingDeletes에서 빠져서 바로 아래 mergeCloud가 클라우드 최신 상태를 정확히 반영한다.
        await retryPendingDeletes(userId);

        const localStores = useFavorites.getState().stores;
        const pendingDeletes = useFavorites.getState().pendingDeletes;
        const cloudStores = await getCloudFavorites(userId);
        const cloudIds = new Set(cloudStores.map((s) => s.id));

        // 게스트 상태에서 추가해 아직 클라우드에 없는 항목을 먼저 업로드한다. mergeCloud가
        // 클라우드를 그대로 로컬에 덮어쓰므로(다른 기기 삭제 반영을 위해 - mergeFavorites.ts
        // 참고), 여기서 먼저 올려두지 않으면 게스트가 추가한 즐겨찾기가 병합 즉시 사라진다.
        const localOnly = Object.values(localStores).filter(
          (s) => !cloudIds.has(s.id) && !pendingDeletes.includes(s.id),
        );
        const uploaded: typeof localOnly = [];
        await Promise.all(
          localOnly.map((store) =>
            addCloudFavorite(userId, store)
              .then(() => uploaded.push(store))
              .catch((err) => reportError(err, "favorites-cloud-add-on-login")),
          ),
        );

        mergeCloud([...cloudStores, ...uploaded]);
      } catch (err) {
        // 동기화 실패해도 로컬 즐겨찾기는 그대로 동작하므로 사용자에게는 조용히 넘어가되,
        // 실제로 얼마나 자주 실패하는지는 Sentry로 확인할 수 있어야 한다.
        reportError(err, "favorites-cloud-sync");
      }
    })();
  }, [userId, mergeCloud, retryPendingDeletes]);
}
