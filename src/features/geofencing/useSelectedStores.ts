import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GEOFENCE_FREE_TIER_MAX } from "@/constants/config";

export type SelectedStore = {
  id: string;
  name: string;
  rank: number | null;
  latitude: number;
  longitude: number;
};

interface SelectedStoresState {
  stores: Record<string, SelectedStore>;
  // 선택 시 true, 해제 시 false, 무료회원 한도(GEOFENCE_FREE_TIER_MAX)를 초과해 추가 시도 시 null 반환
  toggle: (store: SelectedStore) => boolean | null;
}

export const useSelectedStores = create<SelectedStoresState>()(
  persist(
    (set, get) => ({
      stores: {},
      toggle: (store) => {
        const current = get().stores;
        if (current[store.id]) {
          const next = { ...current };
          delete next[store.id];
          set({ stores: next });
          return false;
        }
        if (Object.keys(current).length >= GEOFENCE_FREE_TIER_MAX) {
          return null;
        }
        set({ stores: { ...current, [store.id]: store } });
        return true;
      },
    }),
    {
      name: "geofence-selected-stores",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
