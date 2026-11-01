import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 업데이트 소식 팝업의 상태. 기기에만 저장한다(useScanSettings.ts와 같은 패턴).
//
// 왜 전역 상태인가: 팝업은 app/_layout.tsx에 한 번만 띄워두고, 홈 화면의 자동 띄우기와
// 설정의 "다시 보기"가 같은 창을 연다. 화면마다 모달을 또 달면 두 개가 겹쳐 뜬다.
//
// autoShow를 끄면 자동으로 안 뜰 뿐, 설정에서는 언제든 열 수 있다. 팝업 안 스위치만으로
// 껐다 켤 수 있게 하면 끈 뒤에 다시 켤 길이 없어진다.

interface UpdatePopupState {
  /** 지금 팝업이 열려 있나. 저장하지 않는다 - 앱을 다시 열면 닫힌 상태로 시작한다. */
  open: boolean;
  /** 앱 열 때 새 소식이 있으면 자동으로 띄울지. */
  autoShow: boolean;
  /** 마지막으로 본 소식의 id. 이것과 최신 소식 id가 다를 때만 자동으로 뜬다. */
  seenId: string | null;
  setOpen: (v: boolean) => void;
  setAutoShow: (v: boolean) => void;
  setSeenId: (id: string) => void;
}

export const useUpdatePopup = create<UpdatePopupState>()(
  persist(
    (set) => ({
      open: false,
      autoShow: true,
      seenId: null,
      setOpen: (v) => set({ open: v }),
      setAutoShow: (v) => set({ autoShow: v }),
      setSeenId: (id) => set({ seenId: id }),
    }),
    {
      name: "update-popup",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // open은 저장하지 않는다 - 팝업을 띄운 채로 앱을 닫으면 다음에도 떠버린다.
      partialize: (s) => ({ autoShow: s.autoShow, seenId: s.seenId }),
    },
  ),
);

/** 설정 등 어디서든 팝업을 연다. */
export function openUpdatePopup() {
  useUpdatePopup.getState().setOpen(true);
}
