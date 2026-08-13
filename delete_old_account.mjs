import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deleteOldAccount() {
  console.log("🔍 탈퇴하지 않은 사업자 계정 찾기...\n");

  // Auth 사용자 조회
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error("❌ 조회 실패:", authError.message);
    return;
  }

  console.log(`총 ${authUsers.users.length}명의 사용자:`);
  authUsers.users.forEach((u) => {
    console.log(`   - ${u.email}`);
  });

  // bjgb@naver.com 찾기
  const targetUser = authUsers.users.find((u) => u.email === "bjgb@naver.com");
  if (!targetUser) {
    console.log("\n✅ bjgb@naver.com 이미 삭제됨");
    return;
  }

  console.log(`\n⚠️  삭제 대상: ${targetUser.email} (${targetUser.id})`);
  console.log("📋 조치:");
  console.log("   1. 관련 데이터 정리");
  console.log("   2. Auth 사용자 삭제");

  try {
    // 1) 관련 데이터 정리
    console.log("\n🗑️  관련 데이터 정리 중...");
    await supabase.from("store_owner_profiles").delete().eq("owner_user_id", targetUser.id);
    await supabase.from("favorites").delete().eq("user_id", targetUser.id);
    console.log("✅ 데이터 정리 완료");

    // 2) Auth 사용자 삭제
    console.log("🗑️  Auth 사용자 삭제 중...");
    const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUser.id);
    if (deleteError) {
      console.error("❌ 삭제 실패:", deleteError.message);
      return;
    }
    console.log("✅ Auth 사용자 삭제 완료");

    console.log("\n✅ 모든 처리 완료!");
    console.log("💡 다음 구성요소 업데이트:");
    console.log("   - delete-account Edge Function: 이제 auth.users도 삭제합니다");
    console.log("   - 관리자 대시보드 가입자 수: 1명으로 업데이트될 것입니다");
  } catch (err) {
    console.error("❌ 오류:", err.message);
  }
}

deleteOldAccount();
