import { supabase } from "@/lib/supabase";

export interface LiveGeneratedStats {
  drawNo: number;
  total: number;
  bySource: { source: string; games: number }[];
}

// 아직 추첨 전(집계 전) 회차에 지금까지 나간 생성 번호 현황. 관리자 화면과 생성기 화면의
// "지금 인기" 랭킹이 같은 RPC를 쓴다 - 집계 쿼리를 두 곳에 베껴두지 않기 위해서다.
export async function getLiveGeneratedStats(drawNo: number): Promise<LiveGeneratedStats> {
  const { data, error } = await (supabase.rpc as any)("generated_tickets_live_stats", { p_draw_no: drawNo });
  if (error) throw error;
  return data as LiveGeneratedStats;
}
