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
