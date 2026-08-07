import { supabase } from "@/lib/supabase";
import type { NearbyStoreRow, Store, StoreRankingStats } from "@/types/database.types";

export async function getNearbyStores(
  latitude: number,
  longitude: number,
  radiusM: number,
): Promise<NearbyStoreRow[]> {
  const { data, error } = await (supabase.rpc as any)("nearby_stores", {
    in_lat: latitude,
    in_lng: longitude,
    radius_m: radiusM,
  });
  if (error) throw error;
  return data ?? [];
}

export type StoreSearchResult = Pick<
  Store,
  "id" | "name" | "address" | "sido" | "sigungu" | "latitude" | "longitude"
>;

// 지도검색: GPS 반경과 무관하게 이름/주소로 전체 DB에서 찾는다.
// PostgREST .or() 필터는 raw 문자열을 조립하는 방식이라 쉼표/괄호가 섞인 검색어에서
// 필터 문법이 깨질 수 있어, 이름/주소를 각각 별도 쿼리로 조회해 병합한다.
export async function searchStores(query: string): Promise<StoreSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 이 프로젝트의 Database 타입은 수동 작성본이라 select() 컬럼 문자열 파싱 제네릭이
  // 완전하지 않음 - .returns<T>()로 반환 타입을 명시해 우회한다 (다른 곳의 rpc as any와 동일 사유).
  const [byName, byAddress] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, address, sido, sigungu, latitude, longitude")
      .ilike("name", `%${trimmed}%`)
      .eq("is_active", true)
      .limit(20)
      .returns<StoreSearchResult[]>(),
    supabase
      .from("stores")
      .select("id, name, address, sido, sigungu, latitude, longitude")
      .ilike("address", `%${trimmed}%`)
      .eq("is_active", true)
      .limit(20)
      .returns<StoreSearchResult[]>(),
  ]);

  if (byName.error) throw byName.error;
  if (byAddress.error) throw byAddress.error;

  const merged = new Map<string, StoreSearchResult>();
  for (const row of [...(byName.data ?? []), ...(byAddress.data ?? [])]) {
    merged.set(row.id, row);
  }
  return [...merged.values()].slice(0, 30);
}

export async function getStoreById(storeId: string): Promise<Store | null> {
  const { data, error } = await supabase.from("stores").select("*").eq("id", storeId).single();
  if (error) throw error;
  return data;
}

// nearby_stores()는 당첨 이력이 없는 매장도 지도에 표시하지만, store_ranking_stats는
// 당첨 이력이 있는 매장만 존재한다(refresh_store_ranking_stats가 draw_history 집계 기준으로 채움).
// 그래서 stores를 기준으로 조회하고 store_ranking_stats는 있으면 병합, 없으면 0/null 기본값으로 채운다.
export async function getStoreWithStats(
  storeId: string,
): Promise<(StoreRankingStats & { phone?: string; latitude?: number; longitude?: number }) | null> {
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .single();
  if (storeError && storeError.code !== "PGRST116") throw storeError;
  if (!store) return null;

  const { data: stats, error: statsError } = await supabase
    .from("store_ranking_stats")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();
  if (statsError) throw statsError;

  const s = store as any;
  const r = (stats as any) ?? {};
  return {
    ...s,
    ...r,
    id: s.id,
    name: s.name,
    address: s.address,
    first_prize_count: r.first_prize_count ?? 0,
    second_prize_count: r.second_prize_count ?? 0,
    first_prize_1yr: r.first_prize_1yr ?? 0,
    first_prize_5yr: r.first_prize_5yr ?? 0,
    second_prize_1yr: r.second_prize_1yr ?? 0,
    store_score: r.store_score ?? 0,
    nation_rank: r.nation_rank ?? null,
    province_rank: r.province_rank ?? null,
    city_rank: r.city_rank ?? null,
    phone: s.phone,
    latitude: s.latitude,
    longitude: s.longitude,
  };
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
