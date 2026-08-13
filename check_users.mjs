import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUsers() {
  console.log("🔍 실제 사용자 수 확인 중...\n");

  // 방법 1: Auth 테이블 직접 조회
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error("❌ Auth 조회 실패:", authError.message);
  } else {
    console.log(`✅ Auth 사용자 수: ${authUsers.users.length}명`);
    authUsers.users.forEach((u) => {
      console.log(`   - ${u.email} (${u.id.substring(0, 8)}...)`);
    });
  }

  // 방법 2: get_user_count RPC 호출
  console.log("\n🔍 RPC 함수로 조회:");
  const rpcRes = await supabase.rpc("get_user_count");
  if (rpcRes.error) {
    console.error("❌ RPC 함수 오류:", rpcRes.error.message);
  } else {
    console.log(`✅ get_user_count() 반환값: ${rpcRes.data}`);
  }

  // 방법 3: 만약 profiles 테이블이 있으면 확인
  console.log("\n🔍 Profiles 테이블 확인:");
  const { data: profiles, count: profileCount, error: profileError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (profileError) {
    console.log("   (profiles 테이블 없음)");
  } else {
    console.log(`✅ Profiles 테이블: ${profileCount}명`);
  }
}

checkUsers().catch(console.error);
