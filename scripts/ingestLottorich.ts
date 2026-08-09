// lottorich.co.kr의 JSON API(전국 1등/2등 배출점, 좌표 포함)를 가져와
// 우리 DB를 보강한다:
//  - 기존 매장과 매칭되면(반경 50m + 이름 유사) historical_first/second_prize_count를
//    lottorich 값으로 갱신(기존 값과 비교해 더 큰 쪽 채택 - 절대 줄이지 않음)
//  - 매칭 안 되면 신규 매장으로 추가 (좌표가 이미 있어 지오코딩 불필요)
//  - 1등 없이 2등만 있는 매장도 그대로 포함
// 실행: npx tsx scripts/ingestLottorich.ts
import { v4 as uuidv4 } from "uuid";
import iconv from "iconv-lite";
import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";
import { normalizeAddress } from "./ingest/lib/addressNormalizer";

const REFERER = "https://www.lottorich.co.kr/lotto/lotto_store/index.html";
// 우리(VWorld)와 lottorich의 지오코딩 결과가 같은 주소에서도 100m 이상 차이날 수 있어
// (실측: "로또명당인주점" 동일 주소가 약 121m 차이) 넉넉히 잡는다. 이름 완전/부분일치가
// 함께 요구되므로 반경을 넓혀도 서로 다른 매장이 잘못 묶일 위험은 낮다.
const MATCH_RADIUS_M = 200;

interface LottorichRaw {
  name: string;
  auto_buy: string;
  win_cnt: string;
  sido: string; // 실제로는 지번주소 전체가 들어있는 필드
  road_name: string;
  local_x: string; // 필드명과 반대로 실제로는 위도(실측 확인, 아래 lat/lng 파싱 참고)
  local_y: string; // 필드명과 반대로 실제로는 경도
  rank: string;
}

interface UnifiedStore {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  firstCount: number;
  secondCount: number;
}

async function fetchLottorichRank(rank: 1 | 2): Promise<LottorichRaw[]> {
  const url = `https://www.lottorich.co.kr/lotto/lotto_store/proc.html?mode=list&seq=0&rank=${rank}&pg=1&item_num=15000`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)",
      Referer: REFERER,
    },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = iconv.decode(buf, "euc-kr");
  return JSON.parse(text);
}

function isNonPhysicalStore(entry: LottorichRaw): boolean {
  const name = entry.name ?? "";
  const address = entry.sido ?? "";
  return (
    !name.trim() ||
    name.includes("인터넷") ||
    address.includes("동행복권본사") ||
    address.includes("복권위원회")
  );
}

// 주의: 이 사이트는 필드명이 일반적인 GIS 관례(x=경도,y=위도)와 반대다.
// 실제로는 local_x가 위도(37.xx), local_y가 경도(127.xx)를 담고 있음 (실측 확인함).
function toValidCoords(entry: LottorichRaw): { lat: number; lng: number } | null {
  const lat = parseFloat(entry.local_x);
  const lng = parseFloat(entry.local_y);
  if (!lat || !lng || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

// rank1/rank2 원본을 매장 단위로 합친다 (같은 매장이 두 리스트에 모두 나올 수 있음).
function mergeLottorichData(rank1: LottorichRaw[], rank2: LottorichRaw[]): UnifiedStore[] {
  const merged = new Map<string, UnifiedStore>();

  const addEntry = (entry: LottorichRaw, isFirst: boolean) => {
    if (isNonPhysicalStore(entry)) return;
    const coords = toValidCoords(entry);
    if (!coords) return;

    const address = entry.road_name?.trim() || entry.sido?.trim();
    if (!address) return;
    // 같은 매장 판별 키: 이름 + 좌표(소수 4자리 ≈ 11m 단위로 반올림)
    const key = `${entry.name.trim()}|${coords.lat.toFixed(4)}|${coords.lng.toFixed(4)}`;

    const count = parseInt(entry.win_cnt, 10) || 0;
    const existing = merged.get(key);
    if (existing) {
      if (isFirst) existing.firstCount = Math.max(existing.firstCount, count);
      else existing.secondCount = Math.max(existing.secondCount, count);
    } else {
      merged.set(key, {
        name: entry.name.trim(),
        address,
        latitude: coords.lat,
        longitude: coords.lng,
        firstCount: isFirst ? count : 0,
        secondCount: isFirst ? 0 : count,
      });
    }
  };

  rank1.forEach((e) => addEntry(e, true));
  rank2.forEach((e) => addEntry(e, false));

  return [...merged.values()];
}

interface OurStore {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  historical_first_prize_count: number;
  historical_second_prize_count: number;
}

async function fetchAllOurStores(): Promise<OurStore[]> {
  const all: OurStore[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, latitude, longitude, historical_first_prize_count, historical_second_prize_count")
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
      .returns<OurStore[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

// 위경도 대략 격자(0.002도 ≈ 222m)로 버킷팅해 근접 매장을 빠르게 후보로 좁힌다.
// MATCH_RADIUS_M(200m)을 커버하려면 인접 셀(±1, 3x3)만 훑어도 셀 경계 최악의 경우까지
// 포함되도록 셀 크기를 반경보다 크게 잡는다.
const GRID_CELL_DEG = 0.002;
function gridKey(lat: number, lng: number): string {
  return `${Math.round(lat / GRID_CELL_DEG)}_${Math.round(lng / GRID_CELL_DEG)}`;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeName(name: string): string {
  return name.replace(/[\s()（）·・.,-]/g, "").toLowerCase();
}

function buildGrid(stores: OurStore[]): Map<string, OurStore[]> {
  const grid = new Map<string, OurStore[]>();
  for (const store of stores) {
    const key = gridKey(store.latitude, store.longitude);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(store);
  }
  return grid;
}

function findMatch(grid: Map<string, OurStore[]>, entry: UnifiedStore): OurStore | null {
  const centerLatCell = Math.round(entry.latitude / GRID_CELL_DEG);
  const centerLngCell = Math.round(entry.longitude / GRID_CELL_DEG);

  let best: OurStore | null = null;
  let bestDist = Infinity;
  const entryNormName = normalizeName(entry.name);

  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const candidates = grid.get(`${centerLatCell + dLat}_${centerLngCell + dLng}`);
      if (!candidates) continue;

      for (const candidate of candidates) {
        const dist = haversineM(entry.latitude, entry.longitude, candidate.latitude, candidate.longitude);
        if (dist > MATCH_RADIUS_M) continue;

        const candidateNormName = normalizeName(candidate.name);
        const nameMatches =
          candidateNormName === entryNormName ||
          candidateNormName.includes(entryNormName) ||
          entryNormName.includes(candidateNormName);
        if (!nameMatches) continue;

        if (dist < bestDist) {
          bestDist = dist;
          best = candidate;
        }
      }
    }
  }

  return best;
}

async function main() {
  console.log("🚀 lottorich.co.kr 데이터 수집 시작\n");

  console.log("1️⃣ lottorich.co.kr에서 1등/2등 전체 목록 조회 중...");
  const [rank1, rank2] = await Promise.all([fetchLottorichRank(1), fetchLottorichRank(2)]);
  console.log(`   1등 원본: ${rank1.length}건, 2등 원본: ${rank2.length}건\n`);

  const unified = mergeLottorichData(rank1, rank2);
  console.log(`2️⃣ 병합 결과: ${unified.length}개 매장 (좌표 없음/비물리 매장 제외됨)\n`);

  console.log("3️⃣ 우리 DB 전체 매장 조회 중...");
  const ourStores = await fetchAllOurStores();
  console.log(`   ${ourStores.length}개 매장 로드 완료\n`);

  const grid = buildGrid(ourStores);

  const updates: { id: string; historical_first_prize_count: number; historical_second_prize_count: number }[] = [];
  const inserts: any[] = [];

  for (const entry of unified) {
    const match = findMatch(grid, entry);

    if (match) {
      const newFirst = Math.max(match.historical_first_prize_count, entry.firstCount);
      const newSecond = Math.max(match.historical_second_prize_count, entry.secondCount);
      if (newFirst !== match.historical_first_prize_count || newSecond !== match.historical_second_prize_count) {
        updates.push({ id: match.id, historical_first_prize_count: newFirst, historical_second_prize_count: newSecond });
      }
    } else {
      const normalized = normalizeAddress(entry.address);
      inserts.push({
        id: uuidv4(),
        external_id: null,
        name: entry.name,
        address: normalized.normalized,
        road_address: entry.address,
        sido: normalized.sido,
        sigungu: normalized.sigungu,
        dong_code: null,
        building_main: normalized.buildingMain,
        building_sub: normalized.buildingSub ?? 0,
        latitude: entry.latitude,
        longitude: entry.longitude,
        is_active: true,
        historical_first_prize_count: entry.firstCount,
        historical_second_prize_count: entry.secondCount,
      });
    }
  }

  console.log(`4️⃣ 매칭 결과: 기존 매장 갱신 ${updates.length}건, 신규 매장 추가 ${inserts.length}건\n`);

  if (process.env.DRY_RUN === "1") {
    console.log("🔍 DRY RUN 모드 - DB에 쓰지 않고 샘플만 출력\n");
    console.log("--- 갱신 샘플 5건 ---");
    updates.slice(0, 5).forEach((u) => console.log(`  ${u.id}: 1등=${u.historical_first_prize_count}, 2등=${u.historical_second_prize_count}`));
    console.log("\n--- 신규 추가 샘플 10건 ---");
    inserts.slice(0, 10).forEach((s) =>
      console.log(`  ${s.name} | ${s.address} | (${s.latitude}, ${s.longitude}) | 1등=${s.historical_first_prize_count} 2등=${s.historical_second_prize_count}`),
    );
    process.exit(0);
  }

  // 기존 매장 갱신 (동시 10건씩 병렬)
  console.log("5️⃣ 기존 매장 historical 카운트 갱신 중...");
  const CONCURRENCY = 10;
  let updated = 0;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const batch = updates.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((u) =>
        supabaseAdmin
          .from("stores")
          .update({
            historical_first_prize_count: u.historical_first_prize_count,
            historical_second_prize_count: u.historical_second_prize_count,
          })
          .eq("id", u.id),
      ),
    );
    updated += batch.length;
    if (updated % 500 === 0 || updated === updates.length) {
      console.log(`   갱신 진행: ${updated}/${updates.length}`);
    }
  }

  // 신규 매장 추가 (200개씩 배치 insert)
  console.log("\n6️⃣ 신규 매장 추가 중...");
  const INSERT_CHUNK = 200;
  let inserted = 0;
  let insertFailed = 0;
  for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
    const chunk = inserts.slice(i, i + INSERT_CHUNK);
    const { error } = await (supabaseAdmin.from("stores") as any).insert(chunk);
    if (error) {
      insertFailed += chunk.length;
      console.log(`   ❌ 배치 실패 (${i}~${i + chunk.length}): ${error.message}`);
    } else {
      inserted += chunk.length;
    }
    console.log(`   추가 진행: ${inserted + insertFailed}/${inserts.length} (성공 ${inserted}, 실패 ${insertFailed})`);
  }

  console.log("\n7️⃣ 랭킹 재계산 중 (refresh_store_ranking_stats)...");
  const { error: refreshError } = await supabaseAdmin.rpc("refresh_store_ranking_stats" as any);
  if (refreshError) console.log(`   ❌ 재계산 실패: ${refreshError.message}`);
  else console.log("   ✅ 재계산 완료");

  console.log(`\n✅ 전체 완료`);
  console.log(`   기존 매장 갱신: ${updates.length}건`);
  console.log(`   신규 매장 추가: 성공 ${inserted}건, 실패 ${insertFailed}건`);

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 치명적 오류:", err);
  process.exit(1);
});
