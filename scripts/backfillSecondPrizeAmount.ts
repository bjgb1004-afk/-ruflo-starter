// draw_history에 이미 저장된 회차들의 2등 금액(second_prize_amount_per_win)이
// 비어있는 경우, 오픈소스 미러(smok95/lotto)에서 채워 넣는다.
// 실행: npx tsx scripts/backfillSecondPrizeAmount.ts
import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";

interface OpenLottoResult {
  divisions: { prize: number; winners: number }[];
}

async function fetchSecondPrizeInfo(drwNo: number) {
  const res = await fetch(
    `https://raw.githubusercontent.com/smok95/lotto/master/results/${drwNo}.json`,
  );
  if (!res.ok) return null;
  const d = (await res.json()) as OpenLottoResult;
  const secondDiv = d.divisions?.[1];
  if (!secondDiv) return null;
  return { amountPerWin: secondDiv.prize, winnerCount: secondDiv.winners };
}

async function main() {
  console.log("🚀 기존 회차 2등 금액 백필 시작\n");

  const { data: draws, error } = await supabaseAdmin
    .from("draw_history")
    .select("draw_no")
    .is("second_prize_amount_per_win", null)
    .order("draw_no", { ascending: true });

  if (error) throw error;
  if (!draws || draws.length === 0) {
    console.log("✅ 채울 회차 없음 (모두 이미 채워짐)");
    process.exit(0);
  }

  console.log(`대상: ${draws.length}개 회차 (${draws.map((d) => d.draw_no).join(", ")})\n`);

  let succeeded = 0;
  let failed = 0;

  for (const { draw_no } of draws) {
    const info = await fetchSecondPrizeInfo(draw_no);

    if (!info) {
      failed++;
      console.log(`  ❌ 회차 ${draw_no}: 조회 실패`);
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("draw_history")
      .update({
        second_prize_amount_per_win: info.amountPerWin,
        second_prize_winner_count: info.winnerCount,
      })
      .eq("draw_no", draw_no);

    if (updateError) {
      failed++;
      console.log(`  ❌ 회차 ${draw_no}: 저장 실패 (${updateError.message})`);
    } else {
      succeeded++;
      console.log(`  ✅ 회차 ${draw_no}: ${info.amountPerWin.toLocaleString()}원 (${info.winnerCount}명)`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`\n✅ 완료: 성공 ${succeeded}건, 실패 ${failed}건`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 오류:", err);
  process.exit(1);
});
