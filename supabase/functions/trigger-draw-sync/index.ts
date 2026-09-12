// 앱이 열릴 때 호출되는 엔드포인트. GitHub Actions의 schedule 트리거는 부하 시 몇 시간씩
// 지연되거나 스킵될 수 있어(공식 문서에 명시된 best-effort 동작, 실측으로도 반복 확인됨)
// 정시성이 필요 없다. 대신 "누군가 앱을 열어서 확인하는 시점"에 최신 회차가 없으면 그때
// repository_dispatch로 기존 sync-data.yml을 즉시 깨운다. 여러 사용자가 거의 동시에 열어도
// sync_lock 행의 원자적 UPDATE 하나로 실제 dispatch는 한 번만 나간다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GH_PAT = Deno.env.get("GH_PAT")!;
const GH_REPO = Deno.env.get("GH_REPO") ?? "bjgb1004-afk/-ruflo-starter";

const LOCK_TTL_MS = 2 * 60 * 1000; // 이 시간 안에 재요청 오면 "이미 처리 중"으로 보고 무시
const STALE_AFTER_DAYS = 6; // 로또는 주 1회라 6일 넘게 신규 회차 없으면 "이번 주 아직 미반영"으로 판단

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: latest, error: latestError } = await admin
    .from("draw_history")
    .select("draw_date")
    .order("draw_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return json({ error: latestError.message }, 500);

  const staleMs = STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const isStale = !latest || Date.now() - new Date(latest.draw_date).getTime() > staleMs;
  if (!isStale) return json({ triggered: false, reason: "up-to-date" });

  // 원자적 락 획득 시도: TTL 지난 경우에만 UPDATE가 걸리고 row가 반환된다.
  // 다른 요청이 먼저 통과했으면 이 UPDATE는 0행을 갱신하고 null을 반환한다.
  const { data: lockRow, error: lockError } = await admin
    .from("sync_lock")
    .update({ last_triggered_at: new Date().toISOString() })
    .eq("id", "draw-sync")
    .lt("last_triggered_at", new Date(Date.now() - LOCK_TTL_MS).toISOString())
    .select("id")
    .maybeSingle();
  if (lockError) return json({ error: lockError.message }, 500);
  if (!lockRow) return json({ triggered: false, reason: "already-in-progress" });

  const dispatchRes = await fetch(`https://api.github.com/repos/${GH_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: "sync-draw" }),
  });
  if (!dispatchRes.ok) {
    return json({ error: `github dispatch failed: ${dispatchRes.status} ${await dispatchRes.text()}` }, 502);
  }

  return json({ triggered: true });
});
