import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// "번호를 한 번 더 뽑을 수 있는가"를 기억하는 곳. 폰에만 저장한다(useScanSettings.ts와 같은
// zustand persist + AsyncStorage 패턴).
//
// 규칙 두 개:
//  1. 버튼마다(천재 5명 + 번호대 = 6개) 한 회차에 한 번은 공짜. 회차가 바뀌면 다시 공짜다.
//  2. 보상형 광고를 한 편 보면 그때부터 5분은 버튼 여섯 개 전부 무제한.
//     번호가 마음에 안 들어 다시 뽑는 기능인데 뽑을 때마다 광고를 보게 하면 쓰기 싫어진다.
//     버튼마다 따로 시간을 주면 한 자리에서 광고를 여섯 번 봐야 해서 더 나쁘다.
//     5분이 지나면 다시 광고 한 편이다 - 한 번에 몰아 뽑는 사람에겐 충분하고,
//     다음에 또 올 사람은 그때 광고를 한 편 더 본다.

/** 광고 한 편으로 열리는 무제한 시간. */
export const PASS_DURATION_MS = 5 * 60 * 1000;

export interface DrawCreditsState {
  /** usedFree가 어느 회차 것인지. 회차가 바뀌면 usedFree를 비운다. */
  drawNo: number;
  /** 이 회차에 공짜 한 번을 이미 쓴 버튼들(천재 id 또는 "band"). */
  usedFree: string[];
  /** 무제한 시간이 끝나는 시각(epoch ms). 0이면 없음. */
  passUntil: number;
  /** 공짜 한 번이 남아 있으면 그걸 쓰고 true. 없으면 false. */
  spendFree: (key: string, drawNo: number) => boolean;
  /** 지금 무제한 시간 안인지. */
  hasPass: () => boolean;
  /** 광고를 끝까지 본 직후 호출. 지금부터 5분을 연다. */
  startPass: () => void;
}

export const useDrawCredits = create<DrawCreditsState>()(
  persist(
    (set, get) => ({
      drawNo: 0,
      usedFree: [],
      passUntil: 0,

      spendFree: (key, drawNo) => {
        const stale = get().drawNo !== drawNo;
        const usedFree = stale ? [] : get().usedFree;
        if (usedFree.includes(key)) {
          // 회차가 바뀐 경우엔 비운 목록을 저장해둬야 다음 호출에서 또 비우지 않는다.
          if (stale) set({ drawNo, usedFree });
          return false;
        }
        set({ drawNo, usedFree: [...usedFree, key] });
        return true;
      },

      hasPass: () => Date.now() < get().passUntil,

      startPass: () => set({ passUntil: Date.now() + PASS_DURATION_MS }),
    }),
    {
      name: "draw-credits",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);

/** 그 버튼의 공짜 한 번이 아직 남아 있는지(버튼 문구를 정하는 데만 쓴다). */
export function hasFreeDraw(state: DrawCreditsState, key: string, drawNo: number): boolean {
  if (state.drawNo !== drawNo) return true;
  return !state.usedFree.includes(key);
}
