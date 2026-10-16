// fullayer.com이 제공하는 좌표(위경도)를 우리 stores 테이블과 매칭하는 로직.
// rebuildDrawHistoryFromFullayer.ts(과거 전체 재구축)와 fetchDrawHistory.ts(매주 자동 수집)가
// 공유한다 - 원래 rebuildDrawHistoryFromFullayer.ts에만 있던 걸 분리했다.

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

// 상호 표기 차이 중 실측으로 흔한 것만 통일한다. 추측으로 늘리지 않는다.
const NAME_ALIASES: [RegExp, string][] = [
  [/수퍼/g, "슈퍼"],
  [/쎈/g, "센"],
  [/점$/g, ""],
];

export function normalizeStoreName(raw: string): string {
  let n = raw.replace(/[\s()（）[\]\-.,&＆'"·!?]/g, "").toLowerCase();
  for (const [pattern, to] of NAME_ALIASES) n = n.replace(pattern, to);
  return n;
}

function bigrams(s: string): Set<string> {
  if (s.length <= 1) return new Set([s]);
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

// 예전 구현은 "글자 집합"의 Jaccard였다. 상호는 쓰는 글자가 거의 겹치기 때문에 전혀 다른
// 가게가 쉽게 0.5를 넘었다 - 실측(2026-10-16): "로또복권황성점"과 "로또복권역전점"이
// 0.5를 넘겨 매칭돼, 1등 11회인 황성점의 실적이 역전점에 붙고 황성점은 0회로 남았다.
// 순서를 보는 bigram Jaccard로 바꾸면 그 쌍은 0.33으로 떨어진다. 대신 한쪽이 다른 쪽을
// 그대로 품는 경우("황금복권" ⊂ "황금복권방")는 같은 가게의 표기 차이가 대부분이라
// bigram 점수와 무관하게 통과시킨다.
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeStoreName(a);
  const nb = normalizeStoreName(b);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const setA = bigrams(na);
  const setB = bigrams(nb);
  let intersection = 0;
  for (const g of setA) if (setB.has(g)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
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

const MAX_DISTANCE_M = 200;
const NAME_MATCH_MIN = 0.6;
// 상호가 바뀐 가게나 상호가 없는 가판("상호없음", "-")은 이름으로는 절대 붙지 않는다.
// 아주 가까운 거리에 후보가 딱 하나뿐이면 그 좌표의 복권 판매점은 그 가게로 본다.
const UNIQUE_FALLBACK_M = 60;

export interface MatchCandidateResult {
  store: StoreRow;
  dist: number;
  sim: number;
}

// 반경 200m 이내 후보를 "이름이 맞을 가능성이 높은 순 → 가까운 순"으로 돌려준다.
// 회차 단위로 여러 배출점을 한꺼번에 배정할 때(resolveWinStores) 이미 다른 배출점이
// 차지한 매장을 건너뛰고 다음 후보로 넘어갈 수 있어야 해서 목록으로 준다.
export function findCandidates(record: MatchCandidate, index: StoreGridIndex): MatchCandidateResult[] {
  const [cellLat, cellLng] = index.key(record.latitude, record.longitude).split(":").map(Number);
  const nearby: MatchCandidateResult[] = [];

  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const neighbors = index.grid.get(`${cellLat + dLat}:${cellLng + dLng}`);
      if (!neighbors) continue;
      for (const candidate of neighbors) {
        const dist = haversineMeters(record.latitude, record.longitude, candidate.latitude, candidate.longitude);
        if (dist > MAX_DISTANCE_M) continue;
        nearby.push({ store: candidate, dist, sim: nameSimilarity(record.storeName, candidate.name) });
      }
    }
  }

  const byName = nearby
    .filter((c) => c.sim >= NAME_MATCH_MIN)
    .sort((a, b) => b.sim - a.sim || a.dist - b.dist);
  if (byName.length > 0) return byName;

  const veryClose = nearby.filter((c) => c.dist <= UNIQUE_FALLBACK_M);
  return veryClose.length === 1 ? veryClose : [];
}

export function findMatch(record: MatchCandidate, index: StoreGridIndex): StoreRow | null {
  return findCandidates(record, index)[0]?.store ?? null;
}
