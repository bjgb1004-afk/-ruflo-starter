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
  // 당첨자가 없던 옛 회차 16건만 영구히 비어 있다(project_draw_history_coverage 참고). 그 외
  // 비어 있는 건 추첨 직후라 아직 안 붙은 것 - roundToRefetchFrom이 다시 받아 채운다.
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

// 당첨번호는 추첨 직후 바로 뜨지만 1등 금액은 몇 분 늦게 붙는다(mirrorDraw.ts 참고). 그 틈에
// 폰이 하필 앱을 열면 "번호만 있고 금액은 빈" 상태로 캐시에 박히고, 그 뒤로는 영원히 안
// 고쳐진다 - 아래 fetchDrawsAfter가 "이미 가진 회차보다 큰 것만" 서버에 물어보기 때문이다.
// 그래서 최근 몇 회차는 캐시에 있어도 금액이 비어 있으면 다시 받는다. 오래된 회차가 금액이
// 없는 건 당첨자가 없었던 회차라 영구 결측이므로(282회 이전 등), 이 창 밖은 건드리지 않는다.
const RECENT_RECHECK_WINDOW = 10;

export function roundToRefetchFrom(cached: readonly LottoDraw[]): number {
  if (cached.length === 0) return 0;
  const tailStart = Math.max(0, cached.length - RECENT_RECHECK_WINDOW);
  for (let i = tailStart; i < cached.length; i++) {
    if (cached[i].prizePerWin?.[1] === undefined) return cached[i].round - 1;
  }
  return cached[cached.length - 1].round;
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
  const lastRound = roundToRefetchFrom(cached ?? []);

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
