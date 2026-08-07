import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GEOFENCE_MAX_REGIONS } from "@/constants/config";

export type SelectedStore = {
  id: string;
  name: string;
  rank: number | null;
  latitude: number;
  longitude: number;
};

interface SelectedStoresState {
  stores: Record<string, SelectedStore>;
  // 선택 시 true, 해제 시 false, 이미 20개 선택된 상태에서 추가 시도 시 null 반환
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
        if (Object.keys(current).length >= GEOFENCE_MAX_REGIONS) {
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
