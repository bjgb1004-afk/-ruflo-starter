import { supabase } from "@/lib/supabase";
import type { FavoriteStore } from "./useFavorites";

export async function getCloudFavorites(userId: string): Promise<FavoriteStore[]> {
  const { data, error } = await supabase
    .from("user_favorite_stores")
    .select("store_id, store_name, store_address")
    .eq("user_id", userId)
    .returns<{ store_id: string; store_name: string; store_address: string }[]>();
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.store_id,
    name: row.store_name,
    address: row.store_address,
  }));
}

export async function addCloudFavorite(userId: string, store: FavoriteStore): Promise<void> {
  // 이 프로젝트의 Database 타입은 수동 작성본이라 upsert() insert 제네릭이 완전하지
  // 않음 (다른 곳의 rpc as any와 동일 사유) - as any로 우회.
  const { error } = await (supabase.from("user_favorite_stores") as any).upsert([
    {
      user_id: userId,
      store_id: store.id,
      store_name: store.name,
      store_address: store.address,
    },
  ]);
  if (error) throw error;
}

export async function removeCloudFavorite(userId: string, storeId: string): Promise<void> {
  const { error } = await supabase
    .from("user_favorite_stores")
    .delete()
    .eq("user_id", userId)
    .eq("store_id", storeId);
  if (error) throw error;
}
