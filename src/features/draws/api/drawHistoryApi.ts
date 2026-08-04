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

export async function getWinningsByStore(storeId: string): Promise<StoreWinningRow[]> {
  const { data, error } = await supabase
    .from("draw_history")
    .select("draw_no, draw_date, first_prize_store_ids, second_prize_store_ids")
    .or(
      `first_prize_store_ids.cs.{${storeId}},second_prize_store_ids.cs.{${storeId}}`,
    )
    .order("draw_no", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    draw_no: row.draw_no,
    draw_date: row.draw_date,
    rank: row.first_prize_store_ids?.includes(storeId) ? 1 : 2,
  }));
}
