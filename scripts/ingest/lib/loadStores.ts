// stores 테이블 전체 로드. 매칭 로직(storeMatcher.ts)에서 분리해 둔다 - storeMatcher는
// 순수 계산만 남겨야 jest에서 Supabase 클라이언트 없이 단위 테스트할 수 있다.
import { supabaseAdmin } from "./supabaseAdmin";
import type { StoreRow } from "./storeMatcher";

export async function loadAllStores(): Promise<StoreRow[]> {
  const rows: StoreRow[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  // PostgREST가 응답을 1000행에서 조용히 자르므로 range로 페이징한다.
  while (true) {
    const { data, error }: { data: StoreRow[] | null; error: { message: string } | null } = await (supabaseAdmin
      .from("stores")
      .select("id, name, latitude, longitude, phone") as any)
      .eq("is_active", true)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`stores 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}
