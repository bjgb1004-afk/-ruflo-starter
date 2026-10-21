import { supabase } from "@/lib/supabase";
import { upcomingDrawNo } from "@/features/generator/geniusGenerator";

export interface AdminOverview {
  userCount: number;
  latestDrawNo: number | null;
  latestDrawDate: string | null;
  totalStores: number;
  totalRankedStores: number;
  errorsByFeature: { feature: string; count: number }[];
  /** 아직 추첨 전(집계 전) 회차에 지금까지 나간 생성 번호 현황. */
  liveGenerated: {
    drawNo: number;
    total: number;
    bySource: { source: string; games: number }[];
  };
}

const ERROR_LOOKBACK_DAYS = 7;

export async function getAdminOverview(): Promise<AdminOverview> {
  const [userCountRes, latestDrawRes, storeCountRes, rankedCountRes, errorsRes, liveGeneratedRes] =
    await Promise.all([
      (supabase.rpc as any)("get_user_count"),
      supabase.from("draw_history").select("draw_no, draw_date").order("draw_no", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("stores").select("id", { count: "exact", head: true }),
      supabase.from("store_ranking_stats").select("id", { count: "exact", head: true }),
      supabase
        .from("app_error_logs")
        .select("feature")
        .gte("created_at", new Date(Date.now() - ERROR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()),
      (supabase.rpc as any)("generated_tickets_live_stats", { p_draw_no: upcomingDrawNo() }),
    ]);

  if (userCountRes.error) throw userCountRes.error;
  if (latestDrawRes.error) throw latestDrawRes.error;
  if (storeCountRes.error) throw storeCountRes.error;
  if (rankedCountRes.error) throw rankedCountRes.error;
  if (errorsRes.error) throw errorsRes.error;
  if (liveGeneratedRes.error) throw liveGeneratedRes.error;

  const errorCounts = new Map<string, number>();
  for (const row of (errorsRes.data as any[]) ?? []) {
    errorCounts.set(row.feature, (errorCounts.get(row.feature) ?? 0) + 1);
  }
  const errorsByFeature = [...errorCounts.entries()]
    .map(([feature, count]) => ({ feature, count }))
    .sort((a, b) => b.count - a.count);

  return {
    userCount: userCountRes.data ?? 0,
    latestDrawNo: (latestDrawRes.data as any)?.draw_no ?? null,
    latestDrawDate: (latestDrawRes.data as any)?.draw_date ?? null,
    totalStores: storeCountRes.count ?? 0,
    totalRankedStores: rankedCountRes.count ?? 0,
    errorsByFeature,
    liveGenerated: liveGeneratedRes.data ?? { drawNo: upcomingDrawNo(), total: 0, bySource: [] },
  };
}
