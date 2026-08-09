// fullayer.com이 제공하는 좌표(위경도)를 우리 stores 테이블과 매칭하는 로직.
// rebuildDrawHistoryFromFullayer.ts(과거 전체 재구축)와 fetchDrawHistory.ts(매주 자동 수집)가
// 공유한다 - 원래 rebuildDrawHistoryFromFullayer.ts에만 있던 걸 분리했다.
import { supabaseAdmin } from "./supabaseAdmin";

export interface StoreRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  phone: string | null;
}

export interface MatchCandidate {
  storeName: string;
  latitude: number;
  longitude: number;
}

function nameSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.replace(/[\s()（）\-.,]/g, "").toLowerCase();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;
  const setA = new Set(na);
  const setB = new Set(nb);
  const intersection = new Set([...setA].filter((c) => setB.has(c)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function loadAllStores(): Promise<StoreRow[]> {
  const rows: StoreRow[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
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

export interface StoreGridIndex {
  grid: Map<string, StoreRow[]>;
  key: (lat: number, lng: number) => string;
  CELL_SIZE: number;
}

// 좌표 기반 그리드 인덱스 - O(n^2) 전수비교 대신 인근 셀만 훑는다.
export function buildGrid(stores: StoreRow[]): StoreGridIndex {
  const CELL_SIZE = 0.01;
  const grid = new Map<string, StoreRow[]>();
  const key = (lat: number, lng: number) => `${Math.floor(lat / CELL_SIZE)}:${Math.floor(lng / CELL_SIZE)}`;
  for (const s of stores) {
    const k = key(s.latitude, s.longitude);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(s);
  }
  return { grid, key, CELL_SIZE };
}

// 반경 200m 이내 + 이름 유사도 0.5 이상 중 가장 가까운 매장을 매칭한다.
export function findMatch(record: MatchCandidate, index: StoreGridIndex): StoreRow | null {
  const [cellLat, cellLng] = index.key(record.latitude, record.longitude).split(":").map(Number);
  let best: { store: StoreRow; dist: number } | null = null;

  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const neighbors = index.grid.get(`${cellLat + dLat}:${cellLng + dLng}`);
      if (!neighbors) continue;
      for (const candidate of neighbors) {
        const dist = haversineMeters(record.latitude, record.longitude, candidate.latitude, candidate.longitude);
        if (dist > 200) continue;
        const sim = nameSimilarity(record.storeName, candidate.name);
        if (sim < 0.5) continue;
        if (!best || dist < best.dist) best = { store: candidate, dist };
      }
    }
  }
  return best?.store ?? null;
}
