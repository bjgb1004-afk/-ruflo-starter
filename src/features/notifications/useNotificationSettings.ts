import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 주간 알림(스피또, 명당랭킹)을 종류별로 끄고 켤 수 있게 하는 설정. 서버로는 안 보내고
// 이 기기에만 저장한다(useScanSettings.ts와 동일 패턴). 기본값은 전부 true -
// 이 설정이 생기기 전까지는 알림 권한만 있으면 전부 자동으로 왔으므로, 기존 사용자가
// 업데이트만으로 조용히 수신을 멈추는 일이 없게 한다.
interface NotificationSettingsState {
  spittoWeekly: boolean;
  rankingWeekly: boolean;
  setSpittoWeekly: (v: boolean) => void;
  setRankingWeekly: (v: boolean) => void;
}

export const useNotificationSettings = create<NotificationSettingsState>()(
  persist(
    (set) => ({
      spittoWeekly: true,
      rankingWeekly: true,
      setSpittoWeekly: (v) => set({ spittoWeekly: v }),
      setRankingWeekly: (v) => set({ rankingWeekly: v }),
    }),
    {
      name: "notification-settings",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
