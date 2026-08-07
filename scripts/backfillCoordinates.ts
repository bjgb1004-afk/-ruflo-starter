// 플레이스홀더 좌표(37.5, 126.9)로 남아있는 매장들을 VWorld 지오코딩으로 실좌표 채우기.
// stores.address는 CSV 시드 시점에 이미 정규화되어 저장되어 있으므로 그대로 사용한다.
// 실행: npx tsx scripts/backfillCoordinates.ts
import fs from "fs";
import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";
import { geocodeAddress } from "./ingest/lib/vworldGeo";

const PAGE_SIZE = 1000;
const RATE_LIMIT_MS = 60;
const PLACEHOLDER_LAT = 37.5;
const PLACEHOLDER_LNG = 126.9;

interface PlaceholderStore {
  id: string;
  name: string;
  address: string;
}

async function fetchAllPlaceholderStores(): Promise<PlaceholderStore[]> {
  const all: PlaceholderStore[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, address")
      .eq("latitude", PLACEHOLDER_LAT)
      .eq("longitude", PLACEHOLDER_LNG)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...(data as PlaceholderStore[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

async function main() {
  console.log("🚀 좌표 백필 시작 (플레이스홀더 → 실좌표)\n");

  const targets = await fetchAllPlaceholderStores();
  console.log(`대상: ${targets.length}건\n`);

  let succeeded = 0;
  let failed = 0;
  const failedList: string[] = [];
  const startTime = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const store = targets[i];

    if (!store.address) {
      failed++;
      failedList.push(`${store.name} | (주소 없음)`);
      continue;
    }

    const coords = await geocodeAddress(store.address);

    if (!coords) {
      failed++;
      failedList.push(`${store.name} | ${store.address}`);
    } else {
      const { error } = await supabaseAdmin
        .from("stores")
        .update({ latitude: coords.latitude, longitude: coords.longitude })
        .eq("id", store.id);

      if (error) {
        failed++;
        failedList.push(`${store.name} | ${store.address} | update error: ${error.message}`);
      } else {
        succeeded++;
      }
    }

    if ((i + 1) % 200 === 0 || i === targets.length - 1) {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(
        `  진행 ${i + 1}/${targets.length} (성공 ${succeeded}, 실패 ${failed}) - ${elapsedSec}초 경과`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
  }

  console.log(`\n✅ 완료: 성공 ${succeeded}건, 실패 ${failed}건`);

  if (failedList.length > 0) {
    const logPath = "scripts/backfill-coords-failed.log";
    fs.writeFileSync(logPath, failedList.join("\n"), "utf-8");
    console.log(`실패 목록 저장: ${logPath}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 치명적 오류:", err);
  process.exit(1);
});
