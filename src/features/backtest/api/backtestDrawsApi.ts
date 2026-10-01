import { supabase } from "@/lib/supabase";
import type { LottoDraw } from "@/features/backtest/types";

// 백테스트는 회차 전부가 필요하다. PostgREST는 한 번에 1,000행까지만 주므로(조용히 잘린다)
// range로 끊어 받는다. 잘린 걸 모르고 쓰면 "최근 1,000회만 분석했는데 전체라고 표시"가 된다.
const PAGE = 1000;

interface Row {
  draw_no: number;
  draw_date: string;
  winning_numbers: number[];
  bonus_number: number;
}

/** 오름차순 회차 전체. 백테스트 엔진이 바로 먹는 모양으로 바꿔 돌려준다. */
export async function getDrawsForBacktest(): Promise<LottoDraw[]> {
  const out: LottoDraw[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("draw_history")
      .select("draw_no, draw_date, winning_numbers, bonus_number")
      .order("draw_no", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<Row[]>();
    if (error) throw error;

    const page = data ?? [];
    for (const r of page) {
      out.push({
        round: r.draw_no,
        drawDate: r.draw_date,
        numbers: r.winning_numbers,
        bonus: r.bonus_number,
      });
    }
    if (page.length < PAGE) break;
  }

  return out;
}
