import { supabase } from "@/lib/supabase";

export interface AdminOverview {
  userCount: number;
  latestDrawNo: number | null;
  latestDrawDate: string | null;
  totalStores: number;
  totalRankedStores: number;
  errorsByFeature: { feature: string; count: number }[];
}

const ERROR_LOOKBACK_DAYS = 7;

export async function getAdminOverview(): Promise<AdminOverview> {
  const [userCountRes, latestDrawRes, storeCountRes, rankedCountRes, errorsRes] = await Promise.all([
    (supabase.rpc as any)("get_user_count"),
    supabase.from("draw_history").select("draw_no, draw_date").order("draw_no", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("stores").select("id", { count: "exact", head: true }),
    supabase.from("store_ranking_stats").select("id", { count: "exact", head: true }),
    supabase
      .from("app_error_logs")
      .select("feature")
      .gte("created_at", new Date(Date.now() - ERROR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  if (userCountRes.error) throw userCountRes.error;
  if (latestDrawRes.error) throw latestDrawRes.error;
  if (storeCountRes.error) throw storeCountRes.error;
  if (rankedCountRes.error) throw rankedCountRes.error;
  if (errorsRes.error) throw errorsRes.error;

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
  };
}

export interface DisputedTransfer {
  id: string;
  store_id: string;
  store_name: string;
  previous_owner_email: string;
  new_owner_email: string;
  requested_at: string;
  expires_at: string;
}

export async function getDisputedTransfers(): Promise<DisputedTransfer[]> {
  const { data, error } = await (supabase.rpc as any)("admin_disputed_transfers");
  if (error) throw error;
  return (data ?? []) as DisputedTransfer[];
}

export async function resolveDisputedTransfer(requestId: string, approve: boolean): Promise<void> {
  const { error } = await (supabase.rpc as any)("resolve_disputed_transfer", {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) throw error;
}
