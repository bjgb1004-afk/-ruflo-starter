import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addCloudFavorite, removeCloudFavorite } from "./favoritesApi";
import { reportError } from "@/lib/errorLog";
import { mergeFavorites, type FavoriteStore } from "./mergeFavorites";

export type { FavoriteStore };

// 비로그인 사용자의 즐겨찾기는 이 폰에만 있고, **앱을 지우면 같이 사라진다. 그렇게 두기로
// 결정했다(2026-11-01).** 버그가 아니므로 다시 파지 말 것.
//
// 왜 안 고치나: 되찾으려면 사용자가 다시 제시할 수 있는 신원이 있어야 한다. 익명 번호를
// 만들어 서버에 올려도 그 번호가 이 폰의 저장소에 있으므로 앱과 함께 지워지고, 서버에 남은
// 줄은 주인을 알 수 없는 쓰레기가 된다 - 즉 익명 방식으로는 구조적으로 못 푼다. 유일한
// 방법은 로그인인데, 이 앱은 "로그인 벽 없음"이 설계 원칙이라 그 값을 치르지 않기로 했다.
//
// 안드로이드 자동백업(AndroidManifest의 allowBackup="true")이 운 좋으면 재설치 때
// 복원해준다. 보장은 아니고, 거기까지가 이 기능의 한계다.
//
// 보관함 번호(useMyLottoTickets)도 같은 이유로 같은 상태다.

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
