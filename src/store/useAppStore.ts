import { create } from "zustand";
import { DEFAULT_SEARCH_RADIUS_M } from "@/constants/config";

interface AppState {
  selectedSido: string | null;
  selectedSigungu: string | null;
  searchRadiusM: number;
  setRegion: (sido: string | null, sigungu: string | null) => void;
  setSearchRadiusM: (radiusM: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedSido: null,
  selectedSigungu: null,
  searchRadiusM: DEFAULT_SEARCH_RADIUS_M,
  setRegion: (sido, sigungu) => set({ selectedSido: sido, selectedSigungu: sigungu }),
  setSearchRadiusM: (radiusM) => set({ searchRadiusM: radiusM }),
}));
