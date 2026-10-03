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
  // 실제로 돈을 내고 산 것인지. QR 스캔·번호 직접 입력은 true, 생성기나 놓친 당첨금 화면에서
  // "이 번호 저장"한 것은 false다. 섞어두면 안 산 번호까지 구매액에 들어가 수익률이 거짓이 된다.
  // 이 필드가 생기기 전에 저장된 티켓은 undefined인데, 그때는 스캔·직접입력이 주된 경로였으므로
  // 산 것으로 본다(isPurchased 참고).
  purchased?: boolean;
  // QR 스캔 시 원본으로 찍힌 동행복권 URL - 보관함에서도 "원본 확인" 링크를 열 수 있게 저장한다.
  // 이 필드가 생기기 전에 저장된 기존 티켓은 undefined라 그 카드에는 링크를 표시하지 않는다.
  qrUrl?: string;
}

// 이미 결과가 나온 회차를 스캔한 경우 저장 시점에 바로 checked/rank/prizeAmount를 채워 넣을 수
// 있도록 선택 필드로 둔다. 생략하면(추첨 전 저장) checked=false로 시작해 나중에 markChecked로 갱신한다.
export type NewTicketInput = Pick<MyLottoTicket, "drawNo" | "numbers" | "purchaseType"> &
  // purchased는 일부러 필수다. 기본값을 두면 새 저장 화면을 만들 때 조용히 빠져서
  // 안 산 번호가 다시 구매액에 섞인다 - 부르는 쪽이 매번 밝히게 한다.
  Required<Pick<MyLottoTicket, "purchased">> &
  Partial<Pick<MyLottoTicket, "checked" | "rank" | "prizeAmount" | "qrUrl">>;

/** 산 것으로 볼지. purchased가 없는 구버전 티켓은 산 것으로 센다. */
export function isPurchased(ticket: MyLottoTicket): boolean {
  return ticket.purchased !== false;
}

interface MyLottoState {
  tickets: Record<string, MyLottoTicket>;
  /** 실제로 넣은 게임 수를 돌려준다. 같은 회차·같은 번호는 건너뛰므로 inputs 길이와 다를 수 있다. */
  addTickets: (inputs: NewTicketInput[]) => number;
  markChecked: (id: string, rank: WinRank, prizeAmount: number) => void;
  removeTicket: (id: string) => void;
  clearAll: () => void;
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
        // 같은 용지를 실수로 다시 스캔(리스캔 잠금 창 밖에서 재시도, 화면 재진입 후 재스캔 등)
        // 해도 중복 저장되지 않게, 같은 회차+같은 번호 조합이 이미 있으면 건너뛴다. 그대로 두면
        // 보관함 통계(총 구매액)가 부풀려지고, 추첨 후 같은 결과로 알림도 두 번 온다.
        const existingKeys = new Set(Object.values(next).map((t) => `${t.drawNo}:${t.numbers.join(",")}`));
        // 건너뛴 건 화면에서 알아야 한다. 안 그러면 두 번 누른 사람에게 "저장했어요"라고 거짓말한다.
        let added = 0;
        for (const input of inputs) {
          const key = `${input.drawNo}:${input.numbers.join(",")}`;
          if (existingKeys.has(key)) {
            // 저장만 해뒀던 번호를 나중에 실제로 사서 스캔한 경우. 그냥 건너뛰면 영원히
            // "안 산 번호"로 남아 구매액에서 빠진다 - 그 칸을 산 것으로 올려준다.
            if (input.purchased) {
              for (const [id, t] of Object.entries(next)) {
                if (`${t.drawNo}:${t.numbers.join(",")}` === key && t.purchased === false) {
                  next[id] = { ...t, purchased: true, purchaseType: input.purchaseType };
                }
              }
            }
            continue;
          }
          existingKeys.add(key);
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
          added += 1;
        }
        set({ tickets: next });
        return added;
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

      clearAll: () => {
        set({ tickets: {} });
      },
    }),
    {
      name: "my-lotto-tickets",
      storage: createJSONStorage(() => AsyncStorage),
      // 버전 없이는 필드 이름/모양이 바뀌는 미래 변경이 기존 사용자의 저장된 실제 티켓
      // 데이터를 마이그레이션 없이 그대로 읽어버려 크래시나 조용한 데이터 손상으로 이어진다.
      // 지금 형태를 1로 고정해두고, 다음 스키마 변경부터는 반드시 version을 올리고
      // migrate()로 변환 경로를 명시한다.
      version: 1,
    },
  ),
);
