import { supabase } from "@/lib/supabase";
import type { DrawHistory, StoreWinningRow } from "@/types/database.types";

export async function getLatestDraw(): Promise<DrawHistory | null> {
  const { data, error } = await supabase
    .from("draw_history")
    .select("*")
    .order("draw_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface LatestWinnerStore {
  drawNo: number;
  drawDate: string;
  storeId: string;
  storeName: string;
}

// 홈 화면 배너용: 가장 최근 회차의 1등 배출점 중 하나를 이름과 함께 반환한다.
// (한 회차에 1등 배출점이 여러 곳일 수 있어 첫 번째만 사용, 여러 곳이면 "외 N곳" 문구로 처리)
export async function getLatestFirstPrizeWinners(): Promise<{
  drawNo: number;
  drawDate: string;
  stores: LatestWinnerStore[];
} | null> {
  const draw = await getLatestDraw();
  if (!draw || draw.first_prize_store_ids.length === 0) return null;

  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .in("id", draw.first_prize_store_ids)
    .returns<{ id: string; name: string }[]>();
  if (error) throw error;

  const stores: LatestWinnerStore[] = (data ?? []).map((s) => ({
    drawNo: draw.draw_no,
    drawDate: draw.draw_date,
    storeId: s.id,
    storeName: s.name,
  }));

  return { drawNo: draw.draw_no, drawDate: draw.draw_date, stores };
}

export async function getWinningsByStore(storeId: string): Promise<StoreWinningRow[]> {
  const { data, error } = await (supabase
    .from("draw_history")
    .select("draw_no, draw_date, first_prize_store_ids, second_prize_store_ids") as any)
    .or(
      `first_prize_store_ids.cs.{${storeId}},second_prize_store_ids.cs.{${storeId}}`,
    )
    .order("draw_no", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    draw_no: row.draw_no,
    draw_date: row.draw_date,
    rank: row.first_prize_store_ids?.includes(storeId) ? 1 : 2,
  }));
}

export interface RegionalStatsRow {
  sido: string | null;
  first_prize_count: number;
  second_prize_count: number;
}

export async function getRegionalStats(): Promise<RegionalStatsRow[]> {
  const { data, error } = await supabase
    .from("store_ranking_stats")
    .select("sido, first_prize_count, second_prize_count") as any;
  if (error) throw error;

  // 지역별로 집계
  const stats: Record<string, RegionalStatsRow> = {};
  (data ?? []).forEach((row: any) => {
    const region = row.sido || "기타";
    if (!stats[region]) {
      stats[region] = { sido: region, first_prize_count: 0, second_prize_count: 0 };
    }
    stats[region].first_prize_count += row.first_prize_count;
    stats[region].second_prize_count += row.second_prize_count;
  });

  return Object.values(stats).sort((a, b) => b.first_prize_count - a.first_prize_count);
}

export async function getDrawHistory(limit: number = 20): Promise<DrawHistory[]> {
  const { data, error } = await supabase
    .from("draw_history")
    .select("*")
    .order("draw_no", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
