// Supabase에서 기존 stores 테이블 데이터 삭제
import { supabaseAdmin } from "./lib/supabaseAdmin";

async function main() {
  console.log("🧹 stores 테이블 정리 중...");

  try {
    const { count, error: countError } = await supabaseAdmin
      .from("stores")
      .select("id", { count: "exact", head: true });

    if (countError) {
      console.error("❌ 오류:", countError.message);
      process.exit(1);
    }

    console.log(`📊 현재 레코드: ${count || 0}개`);

    if (count && count > 0) {
      console.log("🗑️  모든 레코드 삭제 중...");

      const { error: deleteError } = await supabaseAdmin.from("stores").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      if (deleteError) {
        console.error("❌ 삭제 실패:", deleteError.message);
        process.exit(1);
      }

      console.log("✅ 삭제 완료!");
    } else {
      console.log("✅ 테이블이 이미 비어있습니다.");
    }

    console.log("");
    console.log("다음 단계:");
    console.log("  npm run ingest:stores");
  } catch (error) {
    console.error("❌ 오류:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ 예상치 못한 오류:", err);
  process.exit(1);
});
