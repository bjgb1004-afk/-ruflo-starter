import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type RecentStore = { id: string; name: string; address: string; viewedAt: number };

const MAX_RECENT = 20;

interface RecentlyViewedState {
  stores: RecentStore[];
  addView: (store: Omit<RecentStore, "viewedAt">) => void;
}

export const useRecentlyViewed = create<RecentlyViewedState>()(
  persist(
    (set, get) => ({
      stores: [],
      addView: (store) => {
        const withoutDupe = get().stores.filter((s) => s.id !== store.id);
        const next = [{ ...store, viewedAt: Date.now() }, ...withoutDupe].slice(0, MAX_RECENT);
        set({ stores: next });
      },
    }),
    {
      name: "recently-viewed-stores",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
