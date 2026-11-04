import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AnalysisSetup } from "./analysisSetup";

// 내가 만든 분석 설정을 폰에만 저장한다. 서버에 올리지 않고 로그인을 붙이지 않는다 -
// 앱을 지우면 사라지는 것이 의도된 동작이다(2026-11-01 결정, useFavorites의 주석 참고).

interface AnalysisSetupsState {
  setups: AnalysisSetup[];
  /** 같은 id면 덮고, 없으면 앞에 넣는다. */
  save: (setup: AnalysisSetup) => void;
  remove: (id: string) => void;
}

export const useAnalysisSetups = create<AnalysisSetupsState>()(
  persist(
    (set) => ({
      setups: [],
      save: (setup) =>
        set((state) => ({ setups: [setup, ...state.setups.filter((s) => s.id !== setup.id)] })),
      remove: (id) => set((state) => ({ setups: state.setups.filter((s) => s.id !== id) })),
    }),
    { name: "analysis-setups-v1", storage: createJSONStorage(() => AsyncStorage) },
  ),
);
