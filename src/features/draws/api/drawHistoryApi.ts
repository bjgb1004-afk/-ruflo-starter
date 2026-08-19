import { supabase } from "@/lib/supabase";
import type { DrawHistory, StoreWinningRow } from "@/types/database.types";

// RecentDrawSummary(당첨번호/당첨금 표시)와 useAutoCheckTickets/scan.tsx(등수/당첨금
// 계산)가 공통으로 쓰는 필드만 선택한다. first_prize_store_ids는 getLatestFirstPrizeWinners가
// 이 함수 결과를 그대로 재사용하기 때문에 필요.
const DRAW_SUMMARY_COLUMNS =
  "draw_no, draw_date, winning_numbers, bonus_number, first_prize_winner_count, first_prize_amount_per_win, second_prize_amount_per_win, second_prize_winner_count, third_prize_amount_per_win, third_prize_winner_count, fourth_prize_winner_count, fifth_prize_winner_count, first_prize_store_ids";

export type DrawSummary = Pick<
  DrawHistory,
  | "draw_no"
  | "draw_date"
  | "winning_numbers"
  | "bonus_number"
  | "first_prize_winner_count"
  | "first_prize_amount_per_win"
  | "second_prize_amount_per_win"
  | "second_prize_winner_count"
  | "third_prize_amount_per_win"
  | "third_prize_winner_count"
  | "fourth_prize_winner_count"
  | "fifth_prize_winner_count"
  | "first_prize_store_ids"
>;

export async function getLatestDraw(): Promise<DrawSummary | null> {
  const { data, error } = await supabase
    .from("draw_history")
    .select(DRAW_SUMMARY_COLUMNS)
    .order("draw_no", { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<DrawSummary>();
  if (error) throw error;
  return data;
}

export async function getDrawByNo(drawNo: number): Promise<DrawSummary | null> {
  const { data, error } = await supabase
    .from("draw_history")
    .select(DRAW_SUMMARY_COLUMNS)
    .eq("draw_no", drawNo)
    .maybeSingle()
    .returns<DrawSummary>();
  if (error) throw error;
  return data;
}

export interface LatestWinnerStore {
  drawNo: number;
  drawDate: string;
  storeId: string;
  storeName: string;
}

// 홈 화면 배너용: 가장 최근 회차의 1등 배출점 중 하나를 이름과 함께 반환한다.
// (한 회차에 1등 배출점이 여러 곳일 수 있어 첫 번째만 사용, 여러 곳이면 "외 N곳" 문구로 처리)
export async function getLatestFirstPrizeWinners(): Promise<{
  drawNo: number;
  drawDate: string;
  stores: LatestWinnerStore[];
} | null> {
  const draw = await getLatestDraw();
  if (!draw || draw.first_prize_store_ids.length === 0) return null;

  // store_ranking_stats에 있는지로 한 번 더 걸러내던 예전 코드는, draw_history엔 이미
  // 확정된 배출점인데 refresh_store_ranking_stats() 배치가 아직 안 돌았거나(회차 수집 직후
  // 몇 초~몇 분의 간격) 매장 병합 직후처럼 그 테이블이 일시적으로 뒤처져 있으면 결과가
  // 통째로 비어버리는 버그였다 - "이번 회차 당첨매장 없음"과 구분이 안 됐다. 이 배너는
  // 매장 이름만 보여주면 되고 순위 데이터가 필요 없으니, stores 조회 결과를 그대로 쓴다.
  const { data: storeData, error: storeError } = await supabase
    .from("stores")
    .select("id, name")
    .in("id", draw.first_prize_store_ids)
    .returns<{ id: string; name: string }[]>();
  if (storeError) throw storeError;

  const stores: LatestWinnerStore[] = (storeData ?? []).map((s) => ({
    drawNo: draw.draw_no,
    drawDate: draw.draw_date,
    storeId: s.id,
    storeName: s.name,
  }));

  return { drawNo: draw.draw_no, drawDate: draw.draw_date, stores };
}

export interface DrawWinnerStore {
  storeId: string;
  storeName: string;
  address: string | null;
  sido: string | null;
  // pyony.com에서 매칭된 경우만 값이 있고, 매칭 안 되면 null(추정하지 않음). 2등은 소스 자체가
  // 없어 항상 null.
  purchaseType: PurchaseType | null;
}

export interface DrawWinnersDetail {
  drawNo: number;
  drawDate: string;
  firstPrizeStores: DrawWinnerStore[];
  secondPrizeStores: DrawWinnerStore[];
  // 1등 배출점 중 구매 방식이 확인된 곳만 집계(요약 카드용). 미확인 매장은 집계에서 제외한다.
  purchaseTypeSummary: Record<PurchaseType, number>;
}

export type PurchaseType = "자동" | "수동" | "반자동";

// 회차 상세(전체 배출업소 목록) 화면용: 1등/2등 배출점 전체를 주소까지 포함해 반환한다.
// 홈 배너는 "N곳 중 1곳"만 보여주지만, 이 화면은 limit/slice 없이 draw_history의
// first_prize_store_ids / second_prize_store_ids 전체를 그대로 조회한다.
export async function getDrawWinnersDetail(drawNo: number): Promise<DrawWinnersDetail | null> {
  const { data: draw, error: drawError } = await supabase
    .from("draw_history")
    .select("draw_no, draw_date, first_prize_store_ids, second_prize_store_ids")
    .eq("draw_no", drawNo)
    .maybeSingle()
    .returns<{
      draw_no: number;
      draw_date: string;
      first_prize_store_ids: string[];
      second_prize_store_ids: string[];
    }>();
  if (drawError) throw drawError;
  if (!draw) return null;

  const allIds = [...draw.first_prize_store_ids, ...draw.second_prize_store_ids];
  if (allIds.length === 0) {
    return {
      drawNo: draw.draw_no,
      drawDate: draw.draw_date,
      firstPrizeStores: [],
      secondPrizeStores: [],
      purchaseTypeSummary: { 자동: 0, 수동: 0, 반자동: 0 },
    };
  }

  const [{ data, error }, { data: methods, error: methodsError }] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, address, sido")
      .in("id", allIds)
      .returns<{ id: string; name: string; address: string | null; sido: string | null }[]>(),
    supabase
      .from("draw_first_prize_methods")
      .select("store_id, purchase_type")
      .eq("draw_no", drawNo)
      .returns<{ store_id: string; purchase_type: PurchaseType }[]>(),
  ]);
  if (error) throw error;
  if (methodsError) throw methodsError;

  const byId = new Map((data ?? []).map((s) => [s.id, s]));
  const methodByStoreId = new Map((methods ?? []).map((m) => [m.store_id, m.purchase_type]));
  const toWinnerStore = (id: string): DrawWinnerStore => {
    const s = byId.get(id);
    return {
      storeId: id,
      storeName: s?.name ?? "알 수 없음",
      address: s?.address ?? null,
      sido: s?.sido ?? null,
      purchaseType: methodByStoreId.get(id) ?? null,
    };
  };

  const purchaseTypeSummary: Record<PurchaseType, number> = { 자동: 0, 수동: 0, 반자동: 0 };
  for (const type of methodByStoreId.values()) {
    purchaseTypeSummary[type]++;
  }

  return {
    drawNo: draw.draw_no,
    drawDate: draw.draw_date,
    firstPrizeStores: draw.first_prize_store_ids.map(toWinnerStore),
    secondPrizeStores: draw.second_prize_store_ids.map(toWinnerStore),
    purchaseTypeSummary,
  };
}

export async function getWinningsByStore(storeId: string): Promise<StoreWinningRow[]> {
  const { data, error } = await (supabase
    .from("draw_history")
    .select("draw_no, draw_date, first_prize_store_ids, second_prize_store_ids") as any)
    .or(
      `first_prize_store_ids.cs.{${storeId}},second_prize_store_ids.cs.{${storeId}}`,
    )
    .order("draw_no", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    draw_no: row.draw_no,
    draw_date: row.draw_date,
    rank: row.first_prize_store_ids?.includes(storeId) ? 1 : 2,
  }));
}

// 판매점 상세 "최근 당첨 이력"용: 이 매장의 1등 당첨 회차별 구매 방식(자동/수동/반자동).
// pyony.com 매칭이 안 된 회차는 맵에 없음(추정하지 않고 UI에서 태그 자체를 숨김).
export async function getPurchaseMethodsForStore(storeId: string): Promise<Map<number, PurchaseType>> {
  const { data, error } = await supabase
    .from("draw_first_prize_methods")
    .select("draw_no, purchase_type")
    .eq("store_id", storeId)
    .returns<{ draw_no: number; purchase_type: PurchaseType }[]>();
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.draw_no, row.purchase_type]));
}

