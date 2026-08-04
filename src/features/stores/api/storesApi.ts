import { supabase } from "@/lib/supabase";
import type { NearbyStoreRow, Store, StoreRankingStats } from "@/types/database.types";

export async function getNearbyStores(
  latitude: number,
  longitude: number,
  radiusM: number,
): Promise<NearbyStoreRow[]> {
  const { data, error } = await supabase.rpc("nearby_stores", {
    in_lat: latitude,
    in_lng: longitude,
    radius_m: radiusM,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getStoreById(storeId: string): Promise<Store | null> {
  const { data, error } = await supabase.from("stores").select("*").eq("id", storeId).single();
  if (error) throw error;
  return data;
}

// store_ranking_stats는 물리 테이블이라 name/address/순위가 이미 컬럼으로 존재하므로
// stores와 별도 join 없이 바로 조회한다.
export async function getTopRankedStores(limit: number): Promise<StoreRankingStats[]> {
  const { data, error } = await supabase
    .from("store_ranking_stats")
    .select("*")
    .order("nation_rank", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
