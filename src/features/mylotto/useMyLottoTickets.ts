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
        const next = { ...get().tickets };
        for (const input of inputs) {
          const id = generateId();
          next[id] = {
            ...input,
            id,
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
