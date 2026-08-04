// 1등 당첨 판매점 현황 정보 CSV → draw_history 로드
// 파일: 기획예산처_온라인복권 1등 당첨 판매점 현황 정보_20260606.csv
//
// 실행: npm run ingest:winning-stores
import fs from "fs";
import { supabaseAdmin } from "./lib/supabaseAdmin";

const WINNING_STORES_CSV = "C:\\Users\\pc\\Downloads\\기획예산처_온라인복권 1등 당첨 판매점 현황 정보_20260606.csv";

interface WinningStoreRecord {
  회차: string;
  당첨판매점명: string;
  당첨판매점주소: string;
  담당판매점: string;
}

function parseCSV(content: string): WinningStoreRecord[] {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim());

  const records: WinningStoreRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = line.split(",").map((v) => v.trim());
    if (values.length < headers.length) continue;

    const record: any = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = values[j] || "";
      record[header] = value;
    }
    records.push(record);
  }

  console.log(`📋 CSV 파싱 완료: ${records.length}개 레코드`);
  console.log(`   헤더: ${headers.join(", ")}`);

  return records;
}

async function main() {
  console.log("🚀 1등 당첨판매점 현황 정보 수집 시작...");
  console.log(`📄 파일: ${WINNING_STORES_CSV}`);
  console.log("");

  try {
    const content = fs.readFileSync(WINNING_STORES_CSV, "utf-8");
    const records = parseCSV(content);

    console.log(`📊 총 ${records.length}개의 당첨판매점 정보 발견`);
    console.log("");

    if (records.length === 0) {
      console.log("⏹️  처리할 데이터가 없습니다.");
      return;
    }

    let processed = 0;
    let skipped = 0;

    // 데이터 샘플 확인
    console.log("📋 데이터 샘플:");
    for (let i = 0; i < Math.min(3, records.length); i++) {
      const r = records[i];
      console.log(`   [${i}] 회차: ${r.회차}, 판매점: ${r.당첨판매점명}`);
    }
    console.log("");

    console.log("✅ 완료!");
    console.log(`   처리: ${processed}건 / 스킵: ${skipped}건`);
    console.log("");
    console.log("⚠️  주의: 이 스크립트는 현재 데이터 검증만 수행합니다.");
    console.log("   실제 draw_history 저장 로직은 추후 구현이 필요합니다.");
  } catch (error) {
    console.error("❌ 배치 실행 실패:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ 예상치 못한 오류:", err);
  process.exit(1);
});
