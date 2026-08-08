import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GameType } from "@/features/qr/parseLottoQr";
import type { WinRank } from "@/features/qr/checkWinnings";

// 로또 한 게임(6자리)의 정가. "총 구매액"은 저장된 티켓 개수 × 이 값으로 계산한다
// (사용자가 직접 입력할 필요 없이 QR에서 게임 수만 알면 자동 산출 가능).
export const LOTTO_UNIT_PRICE = 1000;

export interface MyLottoTicket {
  id: string;
  // 한 번의 QR 스캔(=한 장의 로또 용지)으로 함께 저장된 게임들을 묶는 키. addTickets() 호출
  // 1회당 하나씩 발급되어 그 안의 모든 게임이 같은 groupId를 공유한다("5천원치 샀으면
  // 한번에 묶어달라"는 요구사항 - 같은 용지=같은 그룹). 이 필드가 생기기 전에 저장된
  // 기존 티켓은 groupId가 없을 수 있어, 화면에서는 id로 폴백해 각자 별도 그룹으로 취급한다.
  groupId?: string;
  drawNo: number;
  savedAt: string;
  numbers: number[];
  purchaseType: GameType | null;
  // 추첨 전(아직 draw_history에 결과가 없음)에는 checked=false, rank/prizeAmount는 확정 전.
  checked: boolean;
  rank: WinRank;
  prizeAmount: number;
}

// 이미 결과가 나온 회차를 스캔한 경우 저장 시점에 바로 checked/rank/prizeAmount를 채워 넣을 수
// 있도록 선택 필드로 둔다. 생략하면(추첨 전 저장) checked=false로 시작해 나중에 markChecked로 갱신한다.
export type NewTicketInput = Pick<MyLottoTicket, "drawNo" | "numbers" | "purchaseType"> &
  Partial<Pick<MyLottoTicket, "checked" | "rank" | "prizeAmount">>;

interface MyLottoState {
  tickets: Record<string, MyLottoTicket>;
  addTickets: (inputs: NewTicketInput[]) => void;
  markChecked: (id: string, rank: WinRank, prizeAmount: number) => void;
  removeTicket: (id: string) => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useMyLottoTickets = create<MyLottoState>()(
  persist(
    (set, get) => ({
      tickets: {},

      addTickets: (inputs) => {
        const now = new Date().toISOString();
        const groupId = generateId();
        const next = { ...get().tickets };
        for (const input of inputs) {
          const id = generateId();
          next[id] = {
            ...input,
            id,
            groupId,
            savedAt: now,
            checked: input.checked ?? false,
            rank: input.rank ?? null,
            prizeAmount: input.prizeAmount ?? 0,
          };
        }
        set({ tickets: next });
      },

      markChecked: (id, rank, prizeAmount) => {
        const current = get().tickets[id];
        if (!current) return;
        set({
          tickets: { ...get().tickets, [id]: { ...current, checked: true, rank, prizeAmount } },
        });
      },

      removeTicket: (id) => {
        const next = { ...get().tickets };
        delete next[id];
        set({ tickets: next });
      },
    }),
    {
      name: "my-lotto-tickets",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
