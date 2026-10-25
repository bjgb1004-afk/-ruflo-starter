import { supabase } from "@/lib/supabase";

export interface SpittoRound {
  game_type: string;
  round_no: number;
  game_name: string;
  status: string;
  stock_rate: number | null;
  rank1_remaining: number | null;
  rank1_total: number | null;
  rank2_remaining: number | null;
  rank2_total: number | null;
  rank1_prize: string | null;
  price: number | null;
  sale_end_date: string | null;
  claim_end_date: string | null;
  figures_as_of: string | null;
}

/**
 * 저장된 스피또 회차 전부(2026-10-25 기준 35건).
 *
 * 전엔 서버에서 `status='판매중'`으로 걸러 받았는데 전부 받는 쪽으로 바꿨다. **지급 마감
 * 경고는 판매가 끝난 회차에서 나온다** - 판매중 회차의 지급 기한은 1년 뒤라 급할 일이
 * 없고, 급한 건 작년에 팔린 복권 쪽이다. 35행 ≈ 10KB라 조회 한 번에 둘 다 받는 게
 * 조회를 두 번 하는 것보다 싸다.
 */
export async function getSpittoRounds(): Promise<SpittoRound[]> {
  const { data, error } = await supabase
    .from("spitto_rounds")
    // 문자열을 이어붙이면(+) Supabase의 타입 추론이 깨져 결과가 any 비슷하게 된다.
    // 길어도 한 줄 리터럴로 둘 것.
    // prettier-ignore
    .select("game_type, round_no, game_name, status, stock_rate, rank1_remaining, rank1_total, rank2_remaining, rank2_total, rank1_prize, price, sale_end_date, claim_end_date, figures_as_of");

  if (error) throw error;
  return data ?? [];
}

/**
 * 지금 살 수 있는(판매중) 회차. 1등이 많이 남은 순으로 세운다 - 유저에게 가장 유리한
 * 회차가 맨 위로 오게 하는 게 그 목록의 목적이다.
 *
 * 정렬과 걸러내기를 앱에서 하는 이유: 회차가 서른 몇 개뿐이고, "잔여 ÷ 전체" 비율은
 * SQL로 정렬하려면 0 나누기까지 따져야 해서 오히려 길어진다.
 */
export function sellingRounds(rounds: readonly SpittoRound[]): SpittoRound[] {
  return rounds
    .filter((r) => r.status === "판매중")
    .sort((a, b) => remainingRatio(b) - remainingRatio(a));
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
