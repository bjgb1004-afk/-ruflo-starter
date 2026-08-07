import { useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useFavorites } from "./useFavorites";
import { getCloudFavorites, addCloudFavorite } from "./favoritesApi";

// 로그인 시 1회: 클라우드 즐겨찾기를 로컬과 합치고, 로그인 전 로컬에만 있던
// 항목(게스트 상태에서 추가한 것)은 클라우드로 올려 보낸다.
export function useFavoritesCloudSync() {
  const userId = useAuth((s) => s.user?.id);
  const mergeCloud = useFavorites((s) => s.mergeCloud);
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || syncedUserId.current === userId) return;
    syncedUserId.current = userId;

    (async () => {
      try {
        const localStores = useFavorites.getState().stores;
        const cloudStores = await getCloudFavorites(userId);
        const cloudIds = new Set(cloudStores.map((s) => s.id));

        mergeCloud(cloudStores);

        const localOnly = Object.values(localStores).filter((s) => !cloudIds.has(s.id));
        await Promise.all(localOnly.map((store) => addCloudFavorite(userId, store).catch(() => {})));
      } catch {
        // 동기화 실패해도 로컬 즐겨찾기는 그대로 동작하므로 조용히 무시
      }
    })();
  }, [userId, mergeCloud]);
}
