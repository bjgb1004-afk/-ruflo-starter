import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { normalizeAddress } from "./lib/addressNormalizer";

const STORES_CSV = "C:\Users\pc\Downloads\기획예산처_온라인복권 판매점 주소_20250607.csv";

interface CSVStore {
  번호: string;
  상호: string;
  도로명주소: string;
  지번주소: string;
}

function parseCSV(content: string): CSVStore[] {
  const lines = content.trim().split("\n");
  const headerLine = lines[0];
  const headers = headerLine.split(",");

  const stores: CSVStore[] = [];
  for (let i = 1; i < Math.min(lines.length, 11); i++) {  // 10개만
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(",");
    const store: any = {};
    for (let j = 0; j < headers.length; j++) {
      store[headers[j].trim()] = values[j]?.trim() || "";
    }
    stores.push(store);
  }
  return stores;
}

async function main() {
  const content = fs.readFileSync(STORES_CSV, "utf-8");
  const stores = parseCSV(content);

  console.log(`🚀 ${stores.length}개 데이터 저장 시도...`);

  for (const store of stores) {
    const normalized = normalizeAddress(store.도로명주소 || store.지번주소);
    const storeData = {
      id: uuidv4(),
      external_id: store.번호,
      name: store.상호,
      address: normalized.normalized,
      road_address: store.도로명주소,
      sido: normalized.sido || "미분류",
      sigungu: normalized.sigungu || "미분류",
      latitude: 37.5,
      longitude: 126.9,
      building_main: normalized.buildingMain,
      building_sub: normalized.buildingSub ?? 0,
      is_active: true,
    };

    const { data, error } = await supabaseAdmin.from("stores").insert([storeData]);
    
    if (error) {
      console.error(`❌ ${store.상호}:`, error);
    } else {
      console.log(`✅ ${store.상호}`);
    }
  }

  console.log("완료!");
}

main().catch(console.error);
