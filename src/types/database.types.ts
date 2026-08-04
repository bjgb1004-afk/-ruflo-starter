/* Supabase 데이터베이스 스키마 타입 정의 (자동 생성 대상)
   실제 프로덕션에서는 아래 명령어로 자동 생성:
   supabase gen types typescript --linked > src/types/database.types.ts
*/

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string
          external_id: string | null
          name: string
          store_type: string | null
          address: string
          road_address: string | null
          sido: string | null
          sigungu: string | null
          phone: string | null
          dong_code: string | null
          building_main: number | null
          building_sub: number | null
          latitude: number
          longitude: number
          location: unknown
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Row, "created_at" | "updated_at">
        Update: Partial<Omit<Row, "id" | "created_at">>
        Relationships: []
      }
      draw_history: {
        Row: {
          draw_no: number
          draw_date: string
          winning_numbers: number[]
          bonus_number: number
          first_prize_total_amount: number | null
          first_prize_winner_count: number | null
          first_prize_amount_per_win: number | null
          total_sales_amount: number | null
          first_prize_store_ids: string[]
          second_prize_store_ids: string[]
          created_at: string
        }
        Insert: Omit<Row, "created_at">
        Update: Partial<Omit<Row, "draw_no" | "created_at">>
        Relationships: []
      }
      store_ranking_stats: {
        Row: {
          id: string
          name: string
          address: string
          sido: string | null
          sigungu: string | null
          location: unknown
          first_prize_count: number
          second_prize_count: number
          first_prize_1yr: number
          first_prize_5yr: number
          second_prize_1yr: number
          last_first_prize_draw: number | null
          last_second_prize_draw: number | null
          nation_rank: number | null
          province_rank: number | null
          city_rank: number | null
          store_score: number
          updated_at: string
        }
        Insert: Omit<Row, "updated_at">
        Update: Partial<Omit<Row, "id">>
        Relationships: [{ foreignKeyName: "store_ranking_stats_id_fkey", columns: ["id"], referencedRelation: "stores", referencedColumns: ["id"] }]
      }
    }
    Functions: {
      refresh_store_ranking_stats: { Args: Record<PropertyKey, never>, Returns: void }
      stores_within_radius: { Args: { in_lat: number, in_lng: number, radius_m: number }, Returns: { id: string, name: string, address: string, latitude: number, longitude: number, building_main: number | null, building_sub: number | null }[] }
      nearby_stores: { Args: { in_lat: number, in_lng: number, radius_m?: number, max_results?: number }, Returns: { store_id: string, name: string, address: string, latitude: number, longitude: number, distance_m: number, first_prize_count: number, second_prize_count: number, store_score: number, recommend_score: number, nation_rank: number | null, province_rank: number | null, city_rank: number | null }[] }
    }
  }
}
