// 같은 물리적 매장이 서로 다른 주소 표기(상세도 차이)로 인해 다른 store_id로
// 중복 생성된 경우를 찾아 병합한다 (20m 이내 + 이름 유사도 60% 이상).
// (first+second) 합산 점수가 더 큰 쪽을 "유지" row로 남기되, 두 row의
// historical_first/second_prize_count는 필드별로 큰 값을 취해 유지 row에 병합
// 저장한 뒤 나머지를 삭제한다 (단순 삭제 시 서로 다른 필드에 있던 데이터가 유실됨 -
// 예: A는 1등 카운트가 크고 B는 2등 카운트가 큰 경우).
import { supabaseAdmin } from "./lib/supabaseAdmin";

interface StoreRow {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  historical_first_prize_count: number;
  historical_second_prize_count: number;
}

// 간단한 자카드 유사도 (cascadingMatcher의 similarity.ts와 동일한 접근)
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

async function main() {
  console.log("🔍 중복 매장 탐색 시작...\n");

  const stores: StoreRow[] = [];
  {
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from("stores")
        .select(
          "id, name, address, latitude, longitude, historical_first_prize_count, historical_second_prize_count",
        )
        .or("historical_first_prize_count.gt.0,historical_second_prize_count.gt.0")
        .order("id")
        .range(from, from + PAGE_SIZE - 1)
        .returns<StoreRow[]>();
      if (error) {
        console.error("❌ 조회 실패:", error.message);
        process.exit(1);
      }
      if (!data || data.length === 0) break;
      stores.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  const rows = stores;
  console.log(`📊 베이스라인 있는 매장: ${rows.length}건\n`);

  // 격자 기반 인덱싱으로 O(n^2) 방지 (0.01도 ≈ 1.1km 단위 셀)
  const CELL_SIZE = 0.01;
  const grid = new Map<string, StoreRow[]>();
  const cellKey = (lat: number, lng: number) =>
    `${Math.floor(lat / CELL_SIZE)}:${Math.floor(lng / CELL_SIZE)}`;

  for (const row of rows) {
    const key = cellKey(row.latitude, row.longitude);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(row);
  }

  const toDelete = new Set<string>();
  const merges: Array<{ keep: StoreRow; remove: StoreRow }> = [];

  for (const row of rows) {
    if (toDelete.has(row.id)) continue;

    const [cellLat, cellLng] = cellKey(row.latitude, row.longitude).split(":").map(Number);
    const candidates: StoreRow[] = [];
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -1; dLng <= 1; dLng++) {
        const neighborKey = `${cellLat + dLat}:${cellLng + dLng}`;
        const neighbors = grid.get(neighborKey);
        if (neighbors) candidates.push(...neighbors);
      }
    }

    for (const candidate of candidates) {
      if (candidate.id === row.id) continue;
      if (toDelete.has(candidate.id) || toDelete.has(row.id)) continue;

      const dist = haversineMeters(row.latitude, row.longitude, candidate.latitude, candidate.longitude);
      const sim = nameSimilarity(row.name, candidate.name);

      // 이름이 완전히 같으면(정확 일치) "동/리" 단위 부정확 지오코딩(옛 시드) vs
      // 도로명 정확 지오코딩(신규 시드) 사이 오차를 감안해 넓은 반경 허용.
      // 이름이 다르면(유사도만 높음) 오탐 방지를 위해 좁은 반경만 허용.
      // (매장 수가 1.5만개로 늘어나 체인형 상호명이 흔해졌으므로 2000m는 과해서
      // 500m로 축소 - 서로 다른 지점을 잘못 합치는 위험을 줄인다.)
      const isExactName = row.name.trim() === candidate.name.trim();
      const isExactAddress = row.address.trim() === candidate.address.trim();
      const maxDist = isExactName ? 500 : 20;

      // 지하상가/복합몰처럼 같은 주소인데 지오코딩 소스가 달라 500m 넘게 벌어지는
      // 경우가 있다(예: "메트로센터점" 두 소스가 527m 차이). 주소 텍스트가 완전히
      // 같다면 이름 유사도만 확인하고 거리는 무시한다.
      if (!isExactAddress && dist > maxDist) continue;
      if (sim < 0.6) continue;

      // 중복 발견: (1등+2등) 합산이 큰 쪽을 유지 row로 선택하되, 필드별로는
      // 두 row 중 큰 값을 취해 유지 row에 병합한다 (단순 삭제 시 데이터 유실 방지).
      const rowTotal = row.historical_first_prize_count + row.historical_second_prize_count;
      const candidateTotal = candidate.historical_first_prize_count + candidate.historical_second_prize_count;
      const [keep, remove] = rowTotal >= candidateTotal ? [row, candidate] : [candidate, row];

      keep.historical_first_prize_count = Math.max(
        keep.historical_first_prize_count,
        remove.historical_first_prize_count,
      );
      keep.historical_second_prize_count = Math.max(
        keep.historical_second_prize_count,
        remove.historical_second_prize_count,
      );

      if (!toDelete.has(remove.id)) {
        toDelete.add(remove.id);
        merges.push({ keep, remove });
      }
    }
  }

  console.log(`🔗 병합 대상: ${merges.length}쌍\n`);
  merges.slice(0, 30).forEach((m) => {
    console.log(
      `  유지: ${m.keep.name} (1등${m.keep.historical_first_prize_count}/2등${m.keep.historical_second_prize_count}) ← 삭제: ${m.remove.name} (1등${m.remove.historical_first_prize_count}/2등${m.remove.historical_second_prize_count})`,
    );
  });
  if (merges.length > 30) {
    console.log(`  ... 외 ${merges.length - 30}건`);
  }

  if (process.env.DRY_RUN === "1") {
    console.log("\n⚠️  DRY_RUN 모드: 실제 반영하지 않음");
    return;
  }

  // 유지 row에 병합된(더 큰 쪽 채택) historical 카운트를 먼저 반영
  console.log(`\n💾 유지 row ${merges.length}건 병합 카운트 반영 중...`);
  let mergedCount = 0;
  for (const { keep } of merges) {
    const { error: updateError } = await (supabaseAdmin.from("stores") as any)
      .update({
        historical_first_prize_count: keep.historical_first_prize_count,
        historical_second_prize_count: keep.historical_second_prize_count,
      })
      .eq("id", keep.id);
    if (updateError) {
      console.error(`❌ 병합 반영 실패 (${keep.id}):`, updateError.message);
      continue;
    }
    mergedCount++;
  }
  console.log(`   ${mergedCount}/${merges.length}건 반영 완료`);

  console.log(`\n🗑️  ${toDelete.size}건 삭제 중...`);
  const idsToDelete = Array.from(toDelete);
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < idsToDelete.length; i += BATCH) {
    const batch = idsToDelete.slice(i, i + BATCH);
    const { error: delError } = await (supabaseAdmin.from("stores").delete() as any).in("id", batch);
    if (delError) {
      console.error(`❌ 삭제 실패 (batch ${i}):`, delError.message);
      continue;
    }
    deleted += batch.length;
  }

  console.log(`\n✅ 완료! ${deleted}건 삭제됨`);

  console.log("\n🔄 랭킹 재계산 중 (refresh_store_ranking_stats)...");
  const { error: refreshError } = await supabaseAdmin.rpc("refresh_store_ranking_stats" as any);
  if (refreshError) console.error("   ❌ 재계산 실패:", refreshError.message);
  else console.log("   ✅ 재계산 완료");
}

main().catch((err) => {
  console.error("❌ 실행 실패:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
