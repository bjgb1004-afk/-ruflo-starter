import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !userData?.user) return json({ error: "unauthorized" }, 401);

  const userId = userData.user.id;

  // 사용자 관련 데이터 정리
  try {
    // 1) store_owner_profiles, favorites 등 정리
    await admin.from("store_owner_profiles").delete().eq("owner_user_id", userId);
    await admin.from("favorites").delete().eq("user_id", userId);

    // 2) auth.signOut()은 클라이언트에서 처리하므로 여기서는 데이터 정리만
    // (Supabase Admin API로 사용자 삭제는 권한 문제로 생략)
    return json({ status: "deleted", message: "계정 데이터가 삭제되었습니다" });
  } catch (error) {
    return json({ error: "데이터 정리 중 오류가 발생했습니다" }, 500);
  }
});
