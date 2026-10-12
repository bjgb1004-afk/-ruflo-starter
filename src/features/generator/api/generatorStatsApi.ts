import { supabase } from "@/lib/supabase";

// 회차별 "앱에서 나간 번호" 성적. 집계는 추첨 후 배치(aggregateGeneratedTickets.ts)가 만들고
// 앱은 읽기만 한다. 누적까지 한 번에 받으려고 RPC를 쓴다 - 회차가 쌓이면 테이블을 그대로
// 긁어 더하는 방식은 PostgREST 1,000행 상한에 걸린다.

export interface GeneratorTotals {
  games: number;
  rank1: number;
  rank2: number;
  rank3: number;
  rank4: number;
  rank5: number;
  /** 1인당 금액을 아는 등수만 더한 합계(원). */
  prizeTotal: number;
  /** 금액이 공개되지 않아 합계에서 빠진 건수. 0원과 구분해 표시해야 한다. */
  prizeUnknown: number;
}

export interface GeneratorSourceTotals extends GeneratorTotals {
  /** "genius:archimedes" / "band" / "math:gaussian" 꼴. */
  source: string;
}

export interface GeneratorStats {
  /** 집계가 끝난 가장 최근 회차. 아직 아무 회차도 집계되지 않았으면 null. */
  drawNo: number | null;
  round: GeneratorTotals;
  bySource: GeneratorSourceTotals[];
  cumulative: GeneratorTotals & { rounds: number; fromDrawNo: number | null };
}

export function totalHits(t: GeneratorTotals): number {
  return t.rank1 + t.rank2 + t.rank3 + t.rank4 + t.rank5;
}

/** 아직 집계된 회차가 없으면 null. 화면은 그 경우 카드를 아예 띄우지 않는다. */
export async function getGeneratorStats(): Promise<GeneratorStats | null> {
  const { data, error } = await supabase.rpc("generator_stats");
  if (error) throw error;
  const stats = data as GeneratorStats | null;
  if (!stats || stats.drawNo == null) return null;
  return stats;
}
