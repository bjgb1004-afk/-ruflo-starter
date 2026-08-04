import fs from "fs";
import { normalizeAddress } from "./lib/addressNormalizer";

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
  for (let i = 1; i < lines.length; i++) {
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

const csvPath = '/c/Users/pc/Downloads/기획예산처_온라인복권 판매점 주소_20250607.csv';
const content = fs.readFileSync(csvPath, "utf-8");
const stores = parseCSV(content);

console.log("총 데이터:", stores.length);
console.log("");

// 첫 5개 데이터 분석
for (let i = 0; i < 5; i++) {
  const store = stores[i];
  const rawAddress = store.도로명주소 || store.지번주소;
  const normalized = normalizeAddress(rawAddress);

  console.log(`[${i}] ${store.상호}`);
  console.log(`  원본 주소: ${rawAddress}`);
  console.log(`  정규화: ${normalized.normalized}`);
  console.log(`  빌딩 본번: ${normalized.buildingMain}`);
  console.log("");
}
