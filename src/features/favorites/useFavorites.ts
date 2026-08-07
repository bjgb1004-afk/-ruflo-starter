import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addCloudFavorite, removeCloudFavorite } from "./favoritesApi";

export type FavoriteStore = { id: string; name: string; address: string };

interface FavoritesState {
  stores: Record<string, FavoriteStore>;
  // userId가 있으면(로그인 상태) 로컬 변경과 함께 클라우드에도 write-through한다.
  // 비로그인 사용자는 로컬 저장만 사용한다 (강제 로그인 벽 없음).
  toggle: (store: FavoriteStore, userId?: string | null) => void;
  // 로그인 시 클라우드 목록을 로컬과 합친다 (기존 로컬 즐겨찾기는 유지).
  mergeCloud: (cloudStores: FavoriteStore[]) => void;
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      stores: {},
      toggle: (store, userId) => {
        const current = get().stores;
        if (current[store.id]) {
          const next = { ...current };
          delete next[store.id];
          set({ stores: next });
          if (userId) removeCloudFavorite(userId, store.id).catch(() => {});
        } else {
          set({ stores: { ...current, [store.id]: store } });
          if (userId) addCloudFavorite(userId, store).catch(() => {});
        }
      },
      mergeCloud: (cloudStores) => {
        const current = get().stores;
        const next = { ...current };
        for (const store of cloudStores) {
          next[store.id] = store;
        }
        set({ stores: next });
      },
    }),
    {
      name: "favorite-stores",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
