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

  // 1) 사용자 데이터 정리 (store_owner_profiles, favorites 등)
  const [storeError, favError] = await Promise.all([
    admin.from("store_owner_profiles").delete().eq("owner_user_id", userId).then(r => r.error),
    admin.from("favorites").delete().eq("user_id", userId).then(r => r.error),
  ]);
  if (storeError || favError) {
    return json({ error: "데이터 정리 실패" }, 500);
  }

  // 2) Supabase Auth에서 사용자 삭제 (Admin API 직접 호출)
  const deleteResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  if (!deleteResponse.ok) {
    const errorText = await deleteResponse.text();
    return json({ error: `사용자 삭제 실패: ${errorText}` }, 500);
  }

  return json({ status: "deleted" });
});
