import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 알림을 종류별로 끄고 켤 수 있게 하는 설정. 서버로는 안 보내고 이 기기에만
// 저장한다(useScanSettings.ts와 동일 패턴). 기본값은 전부 true -
// 이 설정이 생기기 전까지는 알림 권한만 있으면 전부 자동으로 왔으므로, 기존 사용자가
// 업데이트만으로 조용히 수신을 멈추는 일이 없게 한다. (새 항목을 더할 때도 기본 true를
// 지킬 것 - 저장된 설정에 없는 키는 여기 초기값으로 떨어지므로 기존 유저가 영향받지 않는다.)
interface NotificationSettingsState {
  spittoWeekly: boolean;
  rankingWeekly: boolean;
  /**
   * 보관함에 저장한 번호에 딸린 추첨 알림 두 종류를 함께 끄고 켠다 - 추첨 시각의
   * "곧 결과가 나와요"(로컬 예약, drawReminders.ts)와 추첨 뒤의 당첨/낙첨 결과
   * (서버 푸시, mylotto/pushSubscription.ts). 유저 눈에는 둘 다 "내가 저장한 번호
   * 때문에 오는 알림"이라 한 스위치로 묶는다. 한쪽만 꺼지면 껐다고 생각한 뒤에도
   * 알림이 와서 스위치가 고장 난 것처럼 보인다.
   */
  drawAlerts: boolean;
  setSpittoWeekly: (v: boolean) => void;
  setRankingWeekly: (v: boolean) => void;
  setDrawAlerts: (v: boolean) => void;
}

export const useNotificationSettings = create<NotificationSettingsState>()(
  persist(
    (set) => ({
      spittoWeekly: true,
      rankingWeekly: true,
      drawAlerts: true,
      setSpittoWeekly: (v) => set({ spittoWeekly: v }),
      setRankingWeekly: (v) => set({ rankingWeekly: v }),
      setDrawAlerts: (v) => set({ drawAlerts: v }),
    }),
    {
      name: "notification-settings",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
