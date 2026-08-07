// design.txt (262회차부터 최근회차까지 누적 1등 배출점, ~1900건)를 파싱해서
// stores 테이블에 지오코딩 + historical_first_prize_count 베이스라인으로 등록한다.
// 기존 TOP100 시드(86건)를 대체하는 훨씬 더 포괄적인 베이스라인.
//
// 실행: npx tsx scripts/ingest/seedFullBaseline.ts
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { geocodeAddress, reverseGeocodeDongCode } from "./lib/vworldGeo";
import { normalizeAddress } from "./lib/addressNormalizer";
import { buildStoreId } from "./lib/storeId";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESIGN_TXT_PATH = path.resolve(__dirname, "../../design.txt");

interface RawRecord {
  name: string;
  count: number;
  address: string;
}

const MIN_COUNT = process.env.MIN_COUNT ? parseInt(process.env.MIN_COUNT, 10) : 2;
const LIMIT = process.env.SEED_LIMIT ? parseInt(process.env.SEED_LIMIT, 10) : Infinity;

function parseDesignTxt(): RawRecord[] {
  const raw = fs.readFileSync(DESIGN_TXT_PATH, "utf-8");
  const lines = raw.split("\n").map((l) => l.replace(/\r$/, ""));

  const records: RawRecord[] = [];

  for (const line of lines) {
    if (!line.trim() || !line.includes("\t")) continue;

    let fields = line.split("\t");
    while (fields.length && fields[fields.length - 1].trim() === "") {
      fields.pop();
    }

    let name: string;
    let countStr: string;
    let address: string;

    if (/^\d+$/.test((fields[0] || "").trim())) {
      [, name, countStr, address] = fields;
    } else {
      [name, countStr, address] = fields;
    }

    name = (name || "").trim();
    const count = parseInt((countStr || "").trim(), 10);
    address = (address || "").trim();

    if (!name || isNaN(count)) continue;

    records.push({ name, count, address });
  }

  return records;
}

function dedupe(records: RawRecord[]): RawRecord[] {
  const seen = new Set<string>();
  const result: RawRecord[] = [];
  for (const r of records) {
    const key = `${r.name}|${r.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(r);
  }
  return result;
}

async function main() {
  const all = parseDesignTxt();
  const physical = all.filter(
    (r) => !(r.name.includes("인터넷") && r.address.includes("동행복권")),
  );
  const filtered = physical.filter((r) => r.count >= MIN_COUNT && r.address.length > 0);
  const records = dedupe(filtered).slice(0, LIMIT);

  console.log(`🚀 전체 베이스라인 시드 시작: ${records.length}건 (count >= ${MIN_COUNT})\n`);

  let succeeded = 0;
  let geocodeFailed = 0;
  let saveFailed = 0;
  const startTime = Date.now();

  for (let i = 0; i < records.length; i++) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    const entry = records[i];
    const normalized = normalizeAddress(entry.address);
    const coords = await geocodeAddress(normalized.normalized);

    if (!coords) {
      geocodeFailed += 1;
      continue;
    }

    const reverse = await reverseGeocodeDongCode(coords);
    const dongCode = reverse?.dongCode ?? "";

    const storeId = buildStoreId({
      dongCode,
      buildingMain: normalized.buildingMain ?? 0,
      buildingSub: normalized.buildingSub ?? 0,
      latitude: coords.latitude,
      longitude: coords.longitude,
    });

    const { error } = await supabaseAdmin.from("stores").upsert(
      {
        id: storeId,
        external_id: null,
        name: entry.name,
        store_type: null,
        address: normalized.normalized,
        road_address: normalized.normalized,
        sido: normalized.sido,
        sigungu: normalized.sigungu,
        phone: null,
        dong_code: dongCode || null,
        building_main: normalized.buildingMain,
        building_sub: normalized.buildingSub ?? 0,
        latitude: coords.latitude,
        longitude: coords.longitude,
        is_active: true,
        historical_first_prize_count: entry.count,
      } as any,
      { onConflict: "id" },
    );

    if (error) {
      saveFailed += 1;
      continue;
    }

    succeeded += 1;

    if ((i + 1) % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(
        `⏳ 진행: ${i + 1}/${records.length} (성공 ${succeeded}, 지오코딩실패 ${geocodeFailed}, 저장실패 ${saveFailed}) - ${elapsed}초 경과`,
      );
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n✅ 완료! (${totalElapsed}초 소요)`);
  console.log(`   성공: ${succeeded}건`);
  console.log(`   지오코딩 실패: ${geocodeFailed}건`);
  console.log(`   저장 실패: ${saveFailed}건`);
}

main().catch((err) => {
  console.error("❌ 실행 실패:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
