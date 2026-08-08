import { supabase } from "@/lib/supabase";

export interface SidoLuckDensity {
  sido: string;
  storeCount: number;
  totalFirstPrize: number;
  luckIndex: number;
}

// 시/도별 매장당 평균 1등 배출 비율("행운 지수") - 값이 높을수록 매장 한 곳당 1등이
// 자주 나온 지역. luck_index desc로 이미 정렬돼서 온다.
export async function getSidoLuckDensity(): Promise<SidoLuckDensity[]> {
  const { data, error } = await (supabase.rpc as any)("sido_luck_density");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    sido: r.sido,
    storeCount: r.store_count,
    totalFirstPrize: r.total_first_prize,
    luckIndex: Number(r.luck_index ?? 0),
  }));
}

export type TrendWindow = 4 | 10 | null; // null = 전체 누적

export interface RegionalTrendRow {
  sido: string;
  firstPrizeCount: number;
}

// weeksBack이 null이면 전체 누적, 숫자면 최근 N회차(주) 기준 시/도별 1등 배출 횟수.
export async function getRegionalTrend(weeksBack: TrendWindow): Promise<RegionalTrendRow[]> {
  const { data, error } = await (supabase.rpc as any)("regional_trend", { weeks_back: weeksBack });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ sido: r.sido, firstPrizeCount: r.first_prize_count }));
}

export interface ConsecutiveWinArea {
  sido: string;
  sigungu: string;
  streakWeeks: number;
}

// 최근 streakWeeks회차 전부에서 1등을 배출한 시/군/구("연속 당첨 지역").
export async function getConsecutiveWinAreas(streakWeeks: number = 3): Promise<ConsecutiveWinArea[]> {
  const { data, error } = await (supabase.rpc as any)("consecutive_win_sigungu", { streak_weeks: streakWeeks });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    sido: r.sido,
    sigungu: r.sigungu,
    streakWeeks: r.streak_weeks_out,
  }));
}

export interface SidoCentroid {
  sido: string;
  latitude: number;
  longitude: number;
}

// 시/도별 운영중 매장 좌표 평균(근사 중심) - 지도 위에 "이번 달 HOT 지역"처럼 지역
// 단위 마커를 찍을 때, 행정구역 경계 데이터가 없어도 실제 매장이 몰린 자리에
// 가깝게 배치할 수 있다.
export async function getSidoCentroids(): Promise<SidoCentroid[]> {
  const { data, error } = await (supabase.rpc as any)("sido_centroids");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    sido: r.sido,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

export interface SidoPurchaseTypeRatio {
  sido: string;
  autoCount: number;
  manualCount: number;
  semiAutoCount: number;
  totalCount: number;
}

// 시/도별 1등 당첨 구매방식(자동/수동/반자동) 건수. totalCount는 "구매방식이 확인된"
// 건수만 집계한 것이라(pyony.com 매칭분만 존재) 시/도 전체 1등 배출 수와는 다를 수 있다.
export async function getSidoPurchaseTypeRatio(): Promise<SidoPurchaseTypeRatio[]> {
  const { data, error } = await (supabase.rpc as any)("sido_purchase_type_ratio");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    sido: r.sido,
    autoCount: r.auto_count,
    manualCount: r.manual_count,
    semiAutoCount: r.semi_auto_count,
    totalCount: r.total_count,
  }));
}
