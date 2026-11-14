// fetchDrawHistory.ts가 새 회차를 저장한 직후 실행. mylotto_push_subscriptions에
// 쌓인(앱에서 티켓 저장 시 등록한) 미통보 구독을 새로 들어온 draw_history와 대조해
// 당첨/낙첨 결과를 Expo Push API로 직접 보낸다(별도 SDK 불필요 - 단순 HTTPS POST).
// 실행: npm run ingest:notify (GitHub Actions sync-data.yml에서 당첨 회차 수집 다음 단계로 실행)
import { supabaseAdmin } from "./lib/supabaseAdmin";

import type { WinRank } from "./lib/mylottoWinRank";
import { buildMessage } from "./lib/mylottoPushMessage";

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
    .select("id, push_token, draw_no, numbers, purchased")
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

  // 한 기기의 한 회차를 묶어 한 통만 보낸다. 구매여부까지 키에 넣는 건 문구가 갈리기
  // 때문이다 - 산 번호와 생성기 번호를 한 통에 섞으면 둘 중 하나는 거짓이 된다.
  const groups = new Map<string, typeof pending>();
  for (const sub of pending) {
    const key = `${sub.push_token}|${sub.draw_no}|${sub.purchased}`;
    const g = groups.get(key);
    if (g) g.push(sub);
    else groups.set(key, [sub]);
  }

  const messages: ExpoPushMessage[] = [];
  const notifiedIds: string[] = [];
  let waiting = 0;

  for (const group of groups.values()) {
    const first = group[0];
    const draw = drawByNo.get(first.draw_no);
    if (!draw) {
      waiting += group.length; // 아직 추첨 전 - 다음 실행 때 재시도
      continue;
    }

    const amountByRank: Record<1 | 2 | 3, number | null> = {
      1: draw.first_prize_amount_per_win,
      2: draw.second_prize_amount_per_win,
      3: draw.third_prize_amount_per_win,
    };

    // 1~3등은 파리뮤추얼 금액이라 당첨번호만 먼저 채워지고 금액 집계가 늦게 붙을 수 있다
    // (fetchDrawHistory.ts와 동일 이유). 그런 게임이 하나라도 있으면 이 묶음 전체를 다음
    // 실행으로 미룬다 - 일부만 보내고 통보 완료로 찍으면 나머지는 영원히 안 간다.
    const ranks = group.map((sub) => computeWinRank(sub.numbers, draw.winning_numbers, draw.bonus_number));
    if (ranks.some((r) => (r === 1 || r === 2 || r === 3) && amountByRank[r] === null)) {
      waiting += group.length;
      continue;
    }

    const wins = ranks
      .filter((r): r is Exclude<WinRank, null> => r !== null)
      .map((rank) => ({
        rank,
        prizeAmount: getPrizeAmount(
          rank,
          draw.first_prize_amount_per_win,
          draw.second_prize_amount_per_win,
          draw.third_prize_amount_per_win,
        ),
      }));

    const message = buildMessage(first.draw_no, first.purchased, wins);
    // message가 null이면 보낼 내용이 없다(안 산 번호의 낙첨). 그래도 통보 완료로 찍어
    // 아래 정리 로직이 번호를 서버에서 지우게 한다.
    if (message) {
      messages.push({ to: first.push_token, sound: "default", title: message.title, body: message.body });
    }
    notifiedIds.push(...group.map((sub) => sub.id));
  }

  console.log(
    `대상: ${pending.length}건을 ${groups.size}묶음으로 묶어 ${messages.length}통 발송 ` +
      `(${waiting}건은 회차 미발표로 대기, ${notifiedIds.length - messages.length}건은 보낼 내용 없음)`,
  );

  if (messages.length > 0) {
    await sendExpoPush(messages);
    console.log(`✅ ${messages.length}통 발송 완료`);
  }

  // 발송이 0통이어도 처리한 묶음은 통보 완료로 찍는다. 안 산 번호의 낙첨은 보낼 내용이
  // 없을 뿐 처리는 끝난 것이고, 안 찍으면 그 번호가 서버에서 영원히 안 지워진다.
  // PostgREST는 조건을 URL에 싣는다 - id 수백 개를 한 번에 넣으면 URL 길이 제한에 걸려
  // 통째로 400이 떨어진다(1250회 실측: 733건 → "Bad Request"). 그러면 발송은 됐는데 통보
  // 기록이 안 남아 다음 실행에서 같은 알림이 또 가고, 번호도 서버에서 안 지워진다.
  const NOTIFIED_UPDATE_CHUNK = 100;
  const notifiedAt = new Date().toISOString();
  for (let i = 0; i < notifiedIds.length; i += NOTIFIED_UPDATE_CHUNK) {
    const { error: updateError } = await supabaseAdmin
      .from("mylotto_push_subscriptions")
      .update({ notified_at: notifiedAt })
      .in("id", notifiedIds.slice(i, i + NOTIFIED_UPDATE_CHUNK));
    if (updateError) console.error("  ❌ notified_at 갱신 실패:", updateError.message);
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
