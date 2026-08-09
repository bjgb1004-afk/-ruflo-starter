import { useEffect } from "react";
import { getDrawByNo } from "@/features/draws/api/drawHistoryApi";
import { computeWinRank, getPrizeAmount } from "@/features/qr/checkWinnings";
import { reportError } from "@/lib/errorLog";
import { useMyLottoTickets } from "./useMyLottoTickets";

// 보관함 화면을 열 때마다 아직 결과를 확인하지 않은 티켓들을 draw_history와 대조한다.
// 추첨 전 회차는 조회해도 결과가 없어(getDrawByNo가 null 반환) 자연스럽게 건너뛰고,
// 다음 방문 때 다시 시도된다 - 별도 서버 푸시나 스케줄러 없이 순수 클라이언트에서 해결.
export function useAutoCheckTickets() {
  const tickets = useMyLottoTickets((s) => s.tickets);
  const markChecked = useMyLottoTickets((s) => s.markChecked);

  useEffect(() => {
    const unchecked = Object.values(tickets).filter((t) => !t.checked);
    if (unchecked.length === 0) return;

    const uniqueDrawNos = [...new Set(unchecked.map((t) => t.drawNo))];

    (async () => {
      for (const drawNo of uniqueDrawNos) {
        let draw;
        try {
          draw = await getDrawByNo(drawNo);
        } catch (err) {
          reportError(err, "mylotto-auto-check");
          continue;
        }
        if (!draw) continue; // 아직 추첨 전 - 다음 방문 때 재시도

        for (const t of unchecked) {
          if (t.drawNo !== drawNo) continue;
          const rank = computeWinRank(t.numbers, draw.winning_numbers, draw.bonus_number);

          // 1~3등은 회차별 변동(파리뮤추얼) 금액이라, 추첨 직후(토 20:35~21:10경)엔 당첨번호만
          // 먼저 채워지고 금액 집계는 아직 null일 수 있다. 이때 markChecked를 호출하면 "1등
          // 당첨 0원"으로 영구 고정돼(checked=true라 다음 방문 때 재검사되지 않음) 되돌릴 수
          // 없으므로, 해당 등수의 금액이 아직 null이면 이번엔 건너뛰고 다음 방문 때 재시도한다.
          const amountByRank: Record<1 | 2 | 3, number | null> = {
            1: draw.first_prize_amount_per_win,
            2: draw.second_prize_amount_per_win,
            3: draw.third_prize_amount_per_win,
          };
          if ((rank === 1 || rank === 2 || rank === 3) && amountByRank[rank] === null) continue;

          const prizeAmount = getPrizeAmount(
            rank,
            draw.first_prize_amount_per_win,
            draw.second_prize_amount_per_win,
            draw.third_prize_amount_per_win,
          );
          markChecked(t.id, rank, prizeAmount);
        }
      }
    })();
  }, [tickets, markChecked]);
}
