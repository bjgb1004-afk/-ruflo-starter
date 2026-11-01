import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

export type AppNotice = Database["public"]["Tables"]["app_notices"]["Row"];

/**
 * 최근 소식 목록. 업데이트 팝업이 쓴다.
 */
export async function getRecentNotices(limit = 5): Promise<AppNotice[]> {
  const { data, error } = await supabase
    .from("app_notices")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
