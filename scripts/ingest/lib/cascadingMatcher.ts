import { supabaseAdmin } from "./supabaseAdmin";
import { nameSimilarity } from "./similarity";

export interface MatchTarget {
  name: string;
  latitude: number;
  longitude: number;
  buildingMain?: number | null;
  buildingSub?: number | null;
}

interface CandidateStore {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  building_main: number | null;
  building_sub: number | null;
}

async function storesWithinRadius(
  latitude: number,
  longitude: number,
  radiusM: number,
): Promise<CandidateStore[]> {
  const { data, error } = await supabaseAdmin.rpc("stores_within_radius", {
    in_lat: latitude,
    in_lng: longitude,
    radius_m: radiusM,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * 단계적 반경/유사도 매칭 (Cascading Match).
 * 서로 다른 데이터 소스(동행복권 발표 텍스트, 공공데이터포털 주소, 재수집 시 좌표 미세 변동)
 * 사이에서 동일한 물리적 판매점을 안정적으로 재식별하기 위한 안전망.
 *
 * 1단계 (20m 이내): 상호 유사도 60% 이상 -> 즉시 매칭
 * 2단계 (50m 이내): 상호 유사도 80% 이상 -> 매칭
 * 3단계 (100m 이내): 건물 본번/부번 완전 일치 -> 매칭
 *
 * 매칭되는 기존 매장이 없으면 null을 반환하며, 호출자는 이 경우
 * storeId.ts의 buildStoreId()로 새 store_id를 생성해 신규 매장으로 등록한다.
 */
export async function cascadingMatch(target: MatchTarget): Promise<string | null> {
  const stage1 = await storesWithinRadius(target.latitude, target.longitude, 20);
  const stage1Match = stage1.find((c) => nameSimilarity(c.name, target.name) >= 0.6);
  if (stage1Match) return stage1Match.id;

  const stage2 = await storesWithinRadius(target.latitude, target.longitude, 50);
  const stage2Match = stage2.find((c) => nameSimilarity(c.name, target.name) >= 0.8);
  if (stage2Match) return stage2Match.id;

  if (target.buildingMain != null) {
    const stage3 = await storesWithinRadius(target.latitude, target.longitude, 100);
    const stage3Match = stage3.find(
      (c) =>
        c.building_main === target.buildingMain &&
        (c.building_sub ?? 0) === (target.buildingSub ?? 0),
    );
    if (stage3Match) return stage3Match.id;
  }

  return null;
}
