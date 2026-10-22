import { supabase } from "@/lib/supabase";

export interface SpittoRound {
  game_type: string;
  round_no: number;
  game_name: string;
  stock_rate: number | null;
  rank1_remaining: number | null;
  rank1_total: number | null;
  rank2_remaining: number | null;
  rank2_total: number | null;
  rank1_prize: string | null;
  price: number | null;
  sale_end_date: string | null;
  figures_as_of: string | null;
}

/**
 * 지금 살 수 있는(판매중) 스피또 회차. 1등이 많이 남은 순으로 세운다 - 유저에게 가장
 * 유리한 회차가 맨 위로 오게 하는 게 이 화면의 목적이다.
 *
 * 정렬은 받아온 뒤 앱에서 한다. 회차가 많아야 열 개 미만이라 서버에 맡길 이유가 없고,
 * "잔여 ÷ 전체" 비율은 SQL로 정렬하려면 0 나누기까지 따져야 해서 오히려 길어진다.
 */
export async function getSellingSpittoRounds(): Promise<SpittoRound[]> {
  const { data, error } = await supabase
    .from("spitto_rounds")
    // 문자열을 이어붙이면(+) Supabase의 타입 추론이 깨져 결과가 any 비슷하게 된다.
    // 길어도 한 줄 리터럴로 둘 것.
    // prettier-ignore
    .select("game_type, round_no, game_name, stock_rate, rank1_remaining, rank1_total, rank2_remaining, rank2_total, rank1_prize, price, sale_end_date, figures_as_of")
    .eq("status", "판매중");

  if (error) throw error;
  return (data ?? []).sort((a, b) => remainingRatio(b) - remainingRatio(a));
}

/** 1등이 몇 할 남았나. 모르는 회차는 맨 뒤로 보낸다. */
export function remainingRatio(round: {
  rank1_remaining: number | null;
  rank1_total: number | null;
}): number {
  const { rank1_remaining: remaining, rank1_total: total } = round;
  if (remaining === null || !total) return -1;
  return remaining / total;
}
