import { supabase } from "@/lib/supabase";

export interface ConsecutiveWinArea {
  sido: string;
  sigungu: string;
  streakWeeks: number;
}

// 최근 streakWeeks회차 전부에서 1등을 배출한 시/군/구("연속 당첨 지역").
export async function getConsecutiveWinAreas(streakWeeks: number = 3): Promise<ConsecutiveWinArea[]> {
  const { data, error } = await (supabase.rpc as any)("consecutive_win_sigungu", { streak_weeks: streakWeeks });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    sido: r.sido,
    sigungu: r.sigungu,
    streakWeeks: r.streak_weeks_out,
  }));
}
