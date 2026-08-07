import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

export type AppNotice = Database["public"]["Tables"]["app_notices"]["Row"];

export async function getLatestNotice(): Promise<AppNotice | null> {
  const { data, error } = await supabase
    .from("app_notices")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
