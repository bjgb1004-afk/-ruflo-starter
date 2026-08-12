import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addCloudFavorite, removeCloudFavorite } from "./favoritesApi";
import { reportError } from "@/lib/errorLog";
import { mergeFavorites, type FavoriteStore } from "./mergeFavorites";

export type { FavoriteStore };

interface FavoritesState {
  stores: Record<string, FavoriteStore>;
  // 클라우드 삭제 요청이 실패(오프라인 등)한 매장 id 목록. 로그인 시 클라우드와 병합할 때
  // 이 목록에 있는 id는 "로컬에서 명시적으로 지운 것"으로 취급해 다시 살아나지 않게 걸러낸다.
  // 성공하면 이 목록에서 빠진다.
  pendingDeletes: string[];
  // userId가 있으면(로그인 상태) 로컬 변경과 함께 클라우드에도 write-through한다.
  // 비로그인 사용자는 로컬 저장만 사용한다 (강제 로그인 벽 없음).
  toggle: (store: FavoriteStore, userId?: string | null) => void;
  // 로그인 시 클라우드 목록을 로컬과 합친다 (기존 로컬 즐겨찾기는 유지).
  // pendingDeletes에 있는 id는 병합에서 제외한다.
  mergeCloud: (cloudStores: FavoriteStore[]) => void;
  retryPendingDeletes: (userId: string) => Promise<void>;
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      stores: {},
      pendingDeletes: [],
      toggle: (store, userId) => {
        const current = get().stores;
        if (current[store.id]) {
          const next = { ...current };
          delete next[store.id];
          set({ stores: next });
          if (userId) {
            set({ pendingDeletes: [...get().pendingDeletes, store.id] });
            removeCloudFavorite(userId, store.id)
              .then(() => {
                set({ pendingDeletes: get().pendingDeletes.filter((id) => id !== store.id) });
              })
              .catch((err) => reportError(err, "favorites-cloud-remove"));
          }
        } else {
          set({ stores: { ...current, [store.id]: store } });
          if (userId) addCloudFavorite(userId, store).catch((err) => reportError(err, "favorites-cloud-add"));
        }
      },
      mergeCloud: (cloudStores) => {
        set({ stores: mergeFavorites(get().stores, cloudStores, get().pendingDeletes) });
      },
      retryPendingDeletes: async (userId) => {
        const pendingDeletes = get().pendingDeletes;
        if (pendingDeletes.length === 0) return;
        await Promise.all(
          pendingDeletes.map((storeId) =>
            removeCloudFavorite(userId, storeId)
              .then(() => {
                set({ pendingDeletes: get().pendingDeletes.filter((id) => id !== storeId) });
              })
              .catch((err) => reportError(err, "favorites-cloud-remove-retry")),
          ),
        );
      },
    }),
    {
      name: "favorite-stores",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
