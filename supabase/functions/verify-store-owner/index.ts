import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchBusinessValidation } from "./hometax.ts";
import {
  evaluateLockout,
  classifyVerification,
  LOCKOUT_ATTEMPT_COUNT,
  type VerificationAttempt,
} from "../_shared/verifyStoreOwnerLogic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 네이티브 앱(RN fetch)은 CORS를 강제하지 않지만, 웹(Expo web)에서 호출하거나 관리자가
// 브라우저에서 직접 테스트할 때는 프리플라이트(OPTIONS)에 CORS 헤더가 없으면 브라우저가
// 실제 POST를 아예 보내지 않고 조용히 막아버린다 - 이 때문에 클라이언트에는 원인 불명의
// "인증 처리 중 오류"로만 보였다.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  const body = await req.json().catch(() => null);
  if (!body?.storeId || !body?.bizName || !body?.bizRegNumber || !body?.repName || !body?.openDate) {
    return json({ error: "missing required fields" }, 400);
  }
  const { storeId, bizName, bizRegNumber, repName, openDate } = body as Record<string, string>;

  // 0) 동시요청 예약 락: 이 (user, store) 쌍에 대한 다른 요청이 이미 처리 중이면(60초 TTL,
  // 홈택스 호출 왕복시간을 넉넉히 덮음) 즉시 물러난다 - 잠금 판정(1번)과 시도기록(5번) 사이의
  // 시간차를 동시 요청 여러 개로 파고들어 5회 실패 잠금을 우회하는 걸 막기 위함.
  const lockUntil = new Date(Date.now() + 60_000).toISOString();
  const { data: lockRow, error: lockError } = await admin
    .from("store_owner_verification_locks")
    .upsert({ user_id: userId, store_id: storeId, locked_until: lockUntil }, { onConflict: "user_id,store_id" })
    .lt("locked_until", new Date().toISOString())
    .select("user_id")
    .maybeSingle();
  if (lockError) return json({ error: lockError.message }, 500);
  if (!lockRow) return json({ error: "이미 처리 중인 요청이 있습니다. 잠시 후 다시 시도해주세요." }, 429);

  try {
    return await handleVerification({ admin, userId, storeId, bizName, bizRegNumber, repName, openDate });
  } finally {
    // 정상 처리가 끝나면 TTL을 기다릴 필요 없이 바로 락을 풀어, 같은 사용자가 바로 이어서
    // 다시 시도(예: 오탈자 정정)할 때 60초를 그냥 기다리지 않게 한다.
    await admin
      .from("store_owner_verification_locks")
      .delete()
      .eq("user_id", userId)
      .eq("store_id", storeId);
  }
});

async function handleVerification({
  admin,
  userId,
  storeId,
  bizName,
  bizRegNumber,
  repName,
  openDate,
}: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  storeId: string;
  bizName: string;
  bizRegNumber: string;
  repName: string;
  openDate: string;
}): Promise<Response> {
  // 1) 잠금 판정
  const { data: recentAttempts, error: attemptsError } = await admin
    .from("store_owner_verification_attempts")
    .select("result, created_at")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(LOCKOUT_ATTEMPT_COUNT);
  if (attemptsError) return json({ error: attemptsError.message }, 500);

  const lockout = evaluateLockout((recentAttempts ?? []) as VerificationAttempt[]);
  if (lockout.locked) return json({ status: "locked", unlockAt: lockout.unlockAt }, 423);

  // 2) 대상 매장 확인
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id, name")
    .eq("id", storeId)
    .maybeSingle();
  if (storeError || !store) return json({ error: "store not found" }, 404);

  // 3) 국세청 진위확인
  const hometax = await fetchBusinessValidation(bizRegNumber, openDate, repName);

  // 4) 상호명 유사도(pg_trgm)
  const { data: similarityScore, error: similarityError } = await (admin.rpc as any)("name_similarity", {
    a: bizName,
    b: store.name,
  });
  if (similarityError) return json({ error: similarityError.message }, 500);

  const verdict = classifyVerification({
    hometaxValid: hometax.valid,
    businessStatus: hometax.businessStatusCode,
    nameSimilarityScore: similarityScore ?? 0,
  });

  // 5) 시도 로그 기록 (성공/실패 모두)
  await admin.from("store_owner_verification_attempts").insert({
    store_id: storeId,
    user_id: userId,
    business_reg_number: bizRegNumber,
    result: verdict.approved ? "approved" : "rejected",
    reject_reason: verdict.reason,
  });

  if (!verdict.approved) return json({ status: "rejected", reason: verdict.reason });

  // 6) 기존 소유자 확인 → 신규 승인 vs 소유권 충돌
  const { data: existingProfile } = await admin
    .from("store_owner_profiles")
    .select("owner_user_id")
    .eq("store_id", storeId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: insertError } = await admin
      .from("store_owner_profiles")
      .insert({ store_id: storeId, owner_user_id: userId });
    if (insertError) return json({ error: insertError.message }, 500);
    return json({ status: "approved" });
  }

  if (existingProfile.owner_user_id === userId) return json({ status: "already_owner" });

  // 소유권 충돌: 기존 pending 요청이 있으면 재사용, 없으면 새로 생성
  const { data: existingTransfer } = await admin
    .from("store_ownership_transfer_requests")
    .select("id")
    .eq("store_id", storeId)
    .eq("new_owner_user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingTransfer) {
    return json({ status: "transfer_pending", transferRequestId: existingTransfer.id });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: transferRequest, error: transferError } = await admin
    .from("store_ownership_transfer_requests")
    .insert({
      store_id: storeId,
      previous_owner_user_id: existingProfile.owner_user_id,
      new_owner_user_id: userId,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (transferError) return json({ error: transferError.message }, 500);

  return json({ status: "transfer_pending", transferRequestId: transferRequest.id });
}
