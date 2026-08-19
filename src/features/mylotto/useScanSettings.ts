import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 스캔 화면 UI 설정(자동촬영 on/off 등). 서버(Supabase)로는 절대 보내지 않고 이 기기에만
// 저장한다 - useMyLottoTickets.ts와 동일한 zustand persist + AsyncStorage 패턴.
interface ScanSettingsState {
  autoCapture: boolean;
  setAutoCapture: (v: boolean) => void;
}

export const useScanSettings = create<ScanSettingsState>()(
  persist(
    (set) => ({
      autoCapture: true,
      setAutoCapture: (v) => set({ autoCapture: v }),
    }),
    {
      name: "scan-settings",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
