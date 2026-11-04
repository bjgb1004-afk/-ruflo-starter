import { supabase } from "@/lib/supabase";
import { mergeDraws, readCachedDraws, writeCachedDraws } from "@/features/backtest/drawCache";
import type { LottoDraw } from "@/features/backtest/types";

// 분석은 회차 전부가 필요하다. PostgREST는 한 번에 1,000행까지만 주므로(조용히 잘린다)
// range로 끊어 받는다. 잘린 걸 모르고 쓰면 "최근 1,000회만 분석했는데 전체라고 표시"가 된다.
const PAGE = 1000;

interface Row {
  draw_no: number;
  draw_date: string;
  winning_numbers: number[];
  bonus_number: number;
  // 1등 금액은 982회 중 18회만 채워져 있다. 리플레이에서 1등이 걸릴 일은 사실상 없어
  // (982회 돌려도 기대 0.00012회) 비어 있어도 화면에 영향이 없다.
  first_prize_amount_per_win: number | null;
  second_prize_amount_per_win: number | null;
  third_prize_amount_per_win: number | null;
}

function toDraw(r: Row): LottoDraw {
  return {
    round: r.draw_no,
    drawDate: r.draw_date,
    numbers: r.winning_numbers,
    bonus: r.bonus_number,
    prizePerWin: {
      ...(r.first_prize_amount_per_win ? { 1: r.first_prize_amount_per_win } : {}),
      ...(r.second_prize_amount_per_win ? { 2: r.second_prize_amount_per_win } : {}),
      ...(r.third_prize_amount_per_win ? { 3: r.third_prize_amount_per_win } : {}),
    },
  };
}

/** afterRound보다 큰 회차만 페이징으로 받는다. afterRound가 0이면 전체. */
async function fetchDrawsAfter(afterRound: number): Promise<LottoDraw[]> {
  const out: LottoDraw[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("draw_history")
      .select(
        "draw_no, draw_date, winning_numbers, bonus_number, " +
          "first_prize_amount_per_win, second_prize_amount_per_win, third_prize_amount_per_win",
      )
      .gt("draw_no", afterRound)
      .order("draw_no", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<Row[]>();
    if (error) throw error;

    const page = data ?? [];
    out.push(...page.map(toDraw));
    if (page.length < PAGE) break;
  }

  return out;
}

/**
 * 오름차순 회차 전체. 폰에 저장된 것을 먼저 읽고 새 회차만 받아 이어붙인다.
 *
 * 네트워크가 안 되면 저장분을 그대로 돌려준다 - 회차 데이터는 지난 것이 바뀌지 않으므로
 * 오프라인에서도 분석 결과가 정확하다(최신 회차 하나가 빠질 뿐이다).
 */
export async function getDrawsForBacktest(): Promise<LottoDraw[]> {
  const cached = await readCachedDraws();
  const lastRound = cached?.length ? cached[cached.length - 1].round : 0;

  let fresh: LottoDraw[];
  try {
    fresh = await fetchDrawsAfter(lastRound);
  } catch (e) {
    if (cached?.length) {
      console.warn("[draws] 수신 실패 - 저장분으로 진행:", e);
      return cached;
    }
    throw e;
  }

  if (fresh.length === 0 && cached?.length) return cached;

  const merged = mergeDraws(cached ?? [], fresh);
  await writeCachedDraws(merged);
  return merged;
}
