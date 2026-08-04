// stores/draw_history 적재 이후 물리 테이블 store_ranking_stats를 재계산한다.
// (누적/최근 1·5년 배출 수, store_score, 전국/시도/시군구 순위)
//
// 실행: npm run ingest:refresh-rankings
// (GitHub Actions sync-data.yml에서 stores/draws 적재 다음 단계로 자동 실행)
import { supabaseAdmin } from "./lib/supabaseAdmin";

async function main() {
  console.log("🚀 store_ranking_stats 재계산 시작...");
  console.log("");

  try {
    const startTime = Date.now();

    console.log("⏳ refresh_store_ranking_stats() 함수 실행 중...");
    const { error } = await supabaseAdmin.rpc("refresh_store_ranking_stats");

    if (error) {
      throw new Error(`RPC 실행 실패: ${error.message}`);
    }

    const elapsedMs = Date.now() - startTime;
    const elapsedSec = (elapsedMs / 1000).toFixed(2);

    console.log("");
    console.log("✅ 재계산 완료!");
    console.log(`   소요 시간: ${elapsedSec}초`);
    console.log("");
    console.log("📊 업데이트된 항목:");
    console.log("   • store_ranking_stats 전체 UPSERT");
    console.log("   • 누적 배출 수 (1등/2등)");
    console.log("   • 최근 1년 배출 수 (1등/2등)");
    console.log("   • 최근 5년 배출 수 (1등)");
    console.log("   • store_score 재계산");
    console.log("   • 전국/시도/시군구 순위 재계산");
  } catch (error) {
    console.error("❌ 재계산 실패:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ 배치 실행 실패:", err);
  process.exit(1);
});
