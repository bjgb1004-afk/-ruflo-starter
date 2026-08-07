// draw_history에 이미 저장된 회차들 중 2등/3등 금액이 비어있는 경우, 오픈소스 미러
// (smok95/lotto)에서 채워 넣는다. 3등은 이전에 앱 코드가 고정금액(1,500,000원)으로 잘못
// 계산하던 것을 바로잡기 위해 추가된 컬럼(third_prize_amount_per_win)을 채우는 용도.
// 실행: npx tsx scripts/backfillThirdPrizeAmount.ts
import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";

interface OpenLottoResult {
  divisions: Array<{ prize: number; winners: number }>;
}

async function fetchDivisions(drwNo: number) {
  const res = await fetch(`https://raw.githubusercontent.com/smok95/lotto/master/results/${drwNo}.json`);
  if (!res.ok) return null;
  const d = (await res.json()) as OpenLottoResult;
  const secondDiv = d.divisions?.[1];
  const thirdDiv = d.divisions?.[2];
  if (!secondDiv || !thirdDiv) return null;
  return {
    second: { amount: secondDiv.prize, winners: secondDiv.winners },
    third: { amount: thirdDiv.prize, winners: thirdDiv.winners },
  };
}

async function main() {
  console.log("🚀 기존 회차 2·3등 금액 백필 시작\n");

  const { data: draws, error } = await supabaseAdmin
    .from("draw_history")
    .select("draw_no")
    .or("second_prize_amount_per_win.is.null,third_prize_amount_per_win.is.null")
    .order("draw_no", { ascending: true });

  if (error) throw error;
  if (!draws || draws.length === 0) {
    console.log("✅ 채울 회차 없음 (모두 이미 채워짐)");
    return;
  }

  console.log(`대상: ${draws.length}개 회차\n`);

  let succeeded = 0;
  let failed = 0;

  for (const { draw_no } of draws as any[]) {
    const info = await fetchDivisions(draw_no);

    if (!info) {
      failed++;
      console.log(`  ❌ 회차 ${draw_no}: 조회 실패`);
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    const { error: updateError } = await (supabaseAdmin.from("draw_history") as any)
      .update({
        second_prize_amount_per_win: info.second.amount,
        second_prize_winner_count: info.second.winners,
        third_prize_amount_per_win: info.third.amount,
        third_prize_winner_count: info.third.winners,
      })
      .eq("draw_no", draw_no);

    if (updateError) {
      failed++;
      console.log(`  ❌ 회차 ${draw_no}: 저장 실패 (${updateError.message})`);
    } else {
      succeeded++;
      if (succeeded % 100 === 0) console.log(`  진행: ${succeeded}건 완료`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`\n✅ 완료: 성공 ${succeeded}건, 실패 ${failed}건`);
}

main().catch((err) => {
  console.error("❌ 오류:", err);
  process.exit(1);
});
