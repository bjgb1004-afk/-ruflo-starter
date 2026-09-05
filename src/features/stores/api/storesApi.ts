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

export type StoreDetail = Pick<
  Store,
  | "id"
  | "name"
  | "address"
  | "phone"
  | "latitude"
  | "longitude"
  | "business_hours"
  | "amenities"
  | "has_parking"
  | "has_restroom"
  | "has_atm"
  | "rating"
  | "review_count"
  | "latest_review"
>;

export async function getStoreById(storeId: string): Promise<StoreDetail | null> {
  const { data, error } = await supabase
    .from("stores")
    .select(
      "id, name, address, phone, latitude, longitude, business_hours, amenities, has_parking, has_restroom, has_atm, rating, review_count, latest_review",
    )
    .eq("id", storeId)
    .single()
    .returns<StoreDetail>();
  if (error) throw error;
  return data;
}

// store_ranking_stats는 당첨 이력이 있는 매장만 존재한다(refresh_store_ranking_stats가
// draw_history 집계 기준으로 채움) - 없으면 0/null 기본값으로 채운다. 이름/주소/좌표 같은
// 고정정보(getStoreById)와 분리해 별도 쿼리로 둔 이유는 useStoreWithStats.ts 참고
// (고정정보는 캐싱, 순위/통계는 매주 바뀌니 캐싱 안 함).
export type StoreRankingStatsOnly = Pick<
  StoreRankingStats,
  | "first_prize_count"
  | "second_prize_count"
  | "first_prize_1yr"
  | "first_prize_5yr"
  | "second_prize_1yr"
  | "store_score"
  | "nation_rank"
  | "province_rank"
  | "city_rank"
>;

export async function getStoreRankingStats(storeId: string): Promise<StoreRankingStatsOnly> {
  const { data, error } = await supabase
    .from("store_ranking_stats")
    .select(
      "first_prize_count, second_prize_count, first_prize_1yr, first_prize_5yr, second_prize_1yr, store_score, nation_rank, province_rank, city_rank",
    )
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw error;

  const r = (data as any) ?? {};
  return {
    first_prize_count: r.first_prize_count ?? 0,
    second_prize_count: r.second_prize_count ?? 0,
    first_prize_1yr: r.first_prize_1yr ?? 0,
    first_prize_5yr: r.first_prize_5yr ?? 0,
    second_prize_1yr: r.second_prize_1yr ?? 0,
    store_score: r.store_score ?? 0,
    nation_rank: r.nation_rank ?? null,
    province_rank: r.province_rank ?? null,
    city_rank: r.city_rank ?? null,
  };
}

// store_ranking_stats는 물리 테이블이라 name/address/순위가 이미 컬럼으로 존재하므로
// stores와 별도 join 없이 바로 조회한다.
export type TopRankedStore = Pick<
  StoreRankingStats,
  "id" | "name" | "address" | "first_prize_count" | "second_prize_count" | "nation_rank" | "province_rank" | "city_rank" | "store_score"
>;

export async function getTopRankedStores(limit: number): Promise<TopRankedStore[]> {
  const { data, error } = await supabase
    .from("store_ranking_stats")
    .select("id, name, address, first_prize_count, second_prize_count, nation_rank, province_rank, city_rank, store_score")
    .order("nation_rank", { ascending: true })
    .limit(limit)
    .returns<TopRankedStore[]>();
  if (error) throw error;
  return data ?? [];
}
