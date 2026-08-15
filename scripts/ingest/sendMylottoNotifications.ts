// fetchDrawHistory.ts가 새 회차를 저장한 직후 실행. mylotto_push_subscriptions에
// 쌓인(앱에서 티켓 저장 시 등록한) 미통보 구독을 새로 들어온 draw_history와 대조해
// 당첨/낙첨 결과를 Expo Push API로 직접 보낸다(별도 SDK 불필요 - 단순 HTTPS POST).
// 실행: npm run ingest:notify (GitHub Actions sync-data.yml에서 당첨 회차 수집 다음 단계로 실행)
import { supabaseAdmin } from "./lib/supabaseAdmin";

type WinRank = 1 | 2 | 3 | 4 | 5 | null;

const FIXED_PRIZE_AMOUNT: Record<4 | 5, number> = { 4: 50_000, 5: 5_000 };

// src/features/qr/checkWinnings.ts와 동일한 판정 규칙(클라이언트 로직을 서버에서도 그대로 사용).
function computeWinRank(pickedNumbers: number[], winningNumbers: number[], bonusNumber: number): WinRank {
  const winningSet = new Set(winningNumbers);
  const uniquePicked = new Set(pickedNumbers);
  const matchCount = [...uniquePicked].filter((n) => winningSet.has(n)).length;
  const hasBonus = uniquePicked.has(bonusNumber);
  if (matchCount === 6) return 1;
  if (matchCount === 5 && hasBonus) return 2;
  if (matchCount === 5) return 3;
  if (matchCount === 4) return 4;
  if (matchCount === 3) return 5;
  return null;
}

function getPrizeAmount(
  rank: WinRank,
  first: number | null,
  second: number | null,
  third: number | null,
): number {
  if (rank === null) return 0;
  if (rank === 1) return first ?? 0;
  if (rank === 2) return second ?? 0;
  if (rank === 3) return third ?? 0;
  return FIXED_PRIZE_AMOUNT[rank];
}

function formatWon(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function buildMessage(rank: WinRank, prizeAmount: number): { title: string; body: string } {
  if (rank === null) {
    return { title: "😢 이번엔 아쉽네요", body: "낙첨입니다. 다음 회차에 다시 도전해보세요!" };
  }
  return {
    title: `🎉 ${rank}등 당첨을 축하합니다!`,
    body: `당첨금 ${formatWon(prizeAmount)}을 확인해보세요.`,
  };
}

interface ExpoPushMessage {
  to: string;
  sound: "default";
  title: string;
  body: string;
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  // Expo Push API는 한 번에 최대 100건 - 100개씩 잘라 보낸다.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error(`  ❌ Expo Push 전송 실패 (${chunk.length}건): ${res.status}`);
      continue;
    }
    const json = await res.json();
    const errors = (json.data ?? []).filter((d: any) => d.status === "error");
    if (errors.length > 0) {
      console.warn(`  ⚠️ 일부 전송 실패(${errors.length}/${chunk.length}건):`, errors.slice(0, 3));
    }
  }
}

async function main() {
  console.log("🔔 보관함 당첨 알림 발송 시작...\n");

  // 미통보 구독이 걸려있는 회차 중, draw_history에 결과가 이미 존재하는 것만 처리한다
  // (아직 추첨 전 회차는 자연히 건너뛰고 다음 실행에서 재시도).
  const { data: pending, error: pendingError } = await supabaseAdmin
    .from("mylotto_push_subscriptions")
    .select("id, push_token, draw_no, numbers")
    .is("notified_at", null);
  if (pendingError) throw pendingError;
  if (!pending || pending.length === 0) {
    console.log("대기중인 구독 없음 - 종료");
    return;
  }

  const drawNos = [...new Set(pending.map((p) => p.draw_no))];
  const { data: draws, error: drawsError } = await supabaseAdmin
    .from("draw_history")
    .select("draw_no, winning_numbers, bonus_number, first_prize_amount_per_win, second_prize_amount_per_win, third_prize_amount_per_win")
    .in("draw_no", drawNos);
  if (drawsError) throw drawsError;
  const drawByNo = new Map(draws?.map((d) => [d.draw_no, d]) ?? []);

  const messages: ExpoPushMessage[] = [];
  const notifiedIds: string[] = [];

  for (const sub of pending) {
    const draw = drawByNo.get(sub.draw_no);
    if (!draw) continue; // 아직 추첨 전 - 다음 실행 때 재시도

    // 1~3등은 파리뮤추얼 금액이라 당첨번호만 먼저 채워지고 금액 집계가 늦게 붙을 수 있다
    // (fetchDrawHistory.ts와 동일 이유) - 그 경우 이번엔 건너뛰고 다음 실행 때 재확인한다.
    const rank = computeWinRank(sub.numbers, draw.winning_numbers, draw.bonus_number);
    const amountByRank: Record<1 | 2 | 3, number | null> = {
      1: draw.first_prize_amount_per_win,
      2: draw.second_prize_amount_per_win,
      3: draw.third_prize_amount_per_win,
    };
    if ((rank === 1 || rank === 2 || rank === 3) && amountByRank[rank] === null) continue;

    const prizeAmount = getPrizeAmount(rank, draw.first_prize_amount_per_win, draw.second_prize_amount_per_win, draw.third_prize_amount_per_win);
    const { title, body } = buildMessage(rank, prizeAmount);
    messages.push({ to: sub.push_token, sound: "default", title, body });
    notifiedIds.push(sub.id);
  }

  console.log(`대상: ${pending.length}건 중 ${messages.length}건 발송 (${pending.length - messages.length}건은 회차 미발표로 대기)`);

  if (messages.length > 0) {
    await sendExpoPush(messages);
    const { error: updateError } = await supabaseAdmin
      .from("mylotto_push_subscriptions")
      .update({ notified_at: new Date().toISOString() })
      .in("id", notifiedIds);
    if (updateError) console.error("  ❌ notified_at 갱신 실패:", updateError.message);
    console.log(`✅ ${messages.length}건 발송 완료`);
  }

  // 번호를 서버에 오래 남기지 않기 위해, 통보 완료됐거나 14일 이상 지난(발표 안 된 회차가
  // 취소/연기됐거나 사용자가 앱을 지운 경우 등) 구독은 정리한다.
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: cleanupError, count } = await supabaseAdmin
    .from("mylotto_push_subscriptions")
    .delete({ count: "exact" })
    .or(`notified_at.not.is.null,created_at.lt.${cutoff}`);
  if (cleanupError) console.error("  ❌ 정리 실패:", cleanupError.message);
  else console.log(`🧹 정리 완료: ${count ?? 0}건 삭제`);
}

main().catch((err) => {
  console.error("❌ 예상치 못한 오류:", err);
  process.exit(1);
});
