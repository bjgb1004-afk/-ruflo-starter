import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1) 이름+주소 완전일치 중복 (이미 병합됐어야 함 - 남아있으면 마이그레이션 실패)
async function checkExactDuplicates() {
  const { data, error } = await supabase.rpc("exec_sql_check_dupes").select();
  return { data, error };
}

async function fetchAllStores() {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("stores")
      .select("id, name, address, latitude, longitude")
      .eq("is_active", true)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  const exact = await fetchAllStores();
  console.log(`총 활성 매장 수: ${exact.length}`);

  const byNameAddr = new Map();
  for (const s of exact) {
    const key = `${s.name}||${s.address}`;
    if (!byNameAddr.has(key)) byNameAddr.set(key, []);
    byNameAddr.get(key).push(s);
  }
  const exactDupes = [...byNameAddr.entries()].filter(([, v]) => v.length > 1);
  console.log(`\n[이름+주소 완전일치 중복] ${exactDupes.length}건`);
  exactDupes.slice(0, 20).forEach(([key, v]) => {
    console.log(`  - ${key} (${v.length}건): ${v.map((x) => x.id.slice(0, 8)).join(", ")}`);
  });

  // 이름 같고 좌표가 매우 가까운 경우 (주소 표기가 달라 완전일치를 피해간 케이스)
  const byName = new Map();
  for (const s of exact) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  let nearDupeCount = 0;
  const nearDupeSamples = [];
  for (const [name, list] of byName.entries()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.latitude == null || b.latitude == null) continue;
        const dLat = a.latitude - b.latitude;
        const dLng = a.longitude - b.longitude;
        const distM = Math.sqrt(dLat * dLat + dLng * dLng) * 111000; // 대략치
        if (distM < 30) {
          nearDupeCount++;
          if (nearDupeSamples.length < 30) {
            nearDupeSamples.push({ name, a: a.address, b: b.address, distM: distM.toFixed(1), ids: [a.id, b.id] });
          }
        }
      }
    }
  }
  console.log(`\n[동일 이름 + 30m 이내 좌표 근접 중복] ${nearDupeCount}건`);
  nearDupeSamples.forEach((d) => {
    console.log(`  - ${d.name} | "${d.a}" vs "${d.b}" (${d.distM}m) [${d.ids.map((i) => i.slice(0, 8)).join(", ")}]`);
  });

  // 안전 병합 대상: 같은 이름 + 정확히 같은 좌표(0.0m, 지오코딩 실패로 인한 우연 일치 배제) +
  // 한쪽 주소가 다른쪽 주소의 접두어(건물명 등 뒷부분만 다름 = 진짜 같은 매장일 가능성 높음).
  // 도로명 자체가 다른 경우(예: "종로 331" vs "종로 333", 서로 다른 도로)는 지오코딩 폴백으로
  // 좌표만 우연히 겹친 별개 매장일 수 있어 절대 자동병합하지 않는다.
  console.log(`\n[안전 병합 후보: 주소 접두어 일치 + 좌표 완전동일]`);
  const safeMerge = [];
  const needsReview = [];
  for (const [name, list] of byName.entries()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.latitude !== b.latitude || a.longitude !== b.longitude) continue;
        const [shorter, longer] = a.address.length <= b.address.length ? [a, b] : [b, a];
        if (longer.address.startsWith(shorter.address)) {
          safeMerge.push({ name, keep: shorter.id, drop: longer.id, a: a.address, b: b.address });
        } else {
          needsReview.push({ name, a: a.address, b: b.address, ids: [a.id, b.id] });
        }
      }
    }
  }
  console.log(`안전 병합 대상: ${safeMerge.length}건`);
  safeMerge.forEach((d) => console.log(`  - ${d.name} | keep="${d.a}" drop="${d.b}"`));
  console.log(`\n[수동 검토 필요 - 자동병합 제외] ${needsReview.length}건`);
  needsReview.forEach((d) => console.log(`  - ${d.name} | "${d.a}" vs "${d.b}"`));

  await import("fs").then((fs) =>
    fs.writeFileSync(
      "scripts/safe_merge_candidates.json",
      JSON.stringify(safeMerge, null, 2),
    ),
  );
}

main().catch(console.error);
