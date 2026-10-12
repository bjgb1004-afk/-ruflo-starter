// generated_tickets(앱에서 보관함에 저장된 생성 번호)를 새로 발표된 회차와 대조해
// 회차×코너별 성적(게임 수, 등수별 건수, 당첨금 합계)을 generator_round_stats에 쌓고,
// 집계가 끝난 회차의 원본 번호는 삭제한다("매 회차 리셋" - 서버에 번호를 오래 두지 않고
// 용량도 늘지 않는다).
//
// 등수 판정과 당첨금 계산은 앱 화면(놓친 당첨금)과 같은 코드를 쓴다 - src/features/backtest의
// rankOf/prizeOf. 화면과 배치가 다른 답을 내는 일을 구조적으로 막는다.
//
// 실행: npm run ingest:aggregate-generated (sync-data.yml에서 당첨 알림 다음 단계)
import type { LottoDraw } from "../../src/features/backtest/types";
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { tallyGeneratedTickets } from "./lib/tallyGeneratedTickets";

const PAGE = 1000;

interface TicketRow {
  draw_no: number;
  source: string;
  numbers: number[];
}

/** PostgREST는 한 번에 1,000행까지만 준다 - 전부 가져올 때까지 범위를 밀어야 한다. */
async function fetchTickets(drawNo: number): Promise<TicketRow[]> {
  const rows: TicketRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("generated_tickets")
      .select("draw_no, source, numbers")
      .eq("draw_no", drawNo)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as TicketRow[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** 집계 대기 중인 회차들. 번호가 쌓인 회차 중 추첨 결과가 나온 것만 처리한다. */
async function pendingDrawNos(): Promise<number[]> {
  const seen = new Set<number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("generated_tickets")
      .select("draw_no")
      .order("draw_no", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as { draw_no: number }[];
    for (const r of page) seen.add(r.draw_no);
    if (page.length < PAGE) break;
  }
  return [...seen].sort((a, b) => a - b);
}

async function loadDraw(drawNo: number): Promise<LottoDraw | null> {
  const { data, error } = await supabaseAdmin
    .from("draw_history")
    .select(
      "draw_no, winning_numbers, bonus_number, first_prize_amount_per_win, second_prize_amount_per_win, third_prize_amount_per_win",
    )
    .eq("draw_no", drawNo)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const prizePerWin: Partial<Record<1 | 2 | 3, number>> = {};
  if (data.first_prize_amount_per_win != null) prizePerWin[1] = data.first_prize_amount_per_win;
  if (data.second_prize_amount_per_win != null) prizePerWin[2] = data.second_prize_amount_per_win;
  if (data.third_prize_amount_per_win != null) prizePerWin[3] = data.third_prize_amount_per_win;
  return {
    round: data.draw_no,
    numbers: data.winning_numbers,
    bonus: data.bonus_number,
    prizePerWin,
  };
}

async function aggregate(drawNo: number): Promise<void> {
  const draw = await loadDraw(drawNo);
  if (!draw) {
    console.log(`  ${drawNo}회: 아직 추첨 결과 없음 - 다음 실행에서 재시도`);
    return;
  }

  const tickets = await fetchTickets(drawNo);
  if (tickets.length === 0) {
    console.log(`  ${drawNo}회: 번호 없음`);
    return;
  }

  const bySource = tallyGeneratedTickets(tickets, draw);

  const now = new Date().toISOString();
  const rows = [...bySource.entries()].map(([source, s]) => ({
    draw_no: drawNo,
    source,
    games: s.games,
    rank1: s.rank[1],
    rank2: s.rank[2],
    rank3: s.rank[3],
    rank4: s.rank[4],
    rank5: s.rank[5],
    prize_total: s.prizeTotal,
    prize_unknown: s.prizeUnknown,
    updated_at: now,
  }));

  const { error: upsertError } = await supabaseAdmin
    .from("generator_round_stats")
    .upsert(rows, { onConflict: "draw_no,source" });
  if (upsertError) throw upsertError;

  // 집계가 성공한 뒤에만 지운다. 먼저 지우면 실패 시 번호가 영구히 사라진다.
  const { error: deleteError, count } = await supabaseAdmin
    .from("generated_tickets")
    .delete({ count: "exact" })
    .eq("draw_no", drawNo);
  if (deleteError) throw deleteError;

  const totalHits = rows.reduce((s, r) => s + r.rank1 + r.rank2 + r.rank3 + r.rank4 + r.rank5, 0);
  const totalPrize = rows.reduce((s, r) => s + r.prize_total, 0);
  const unknown = rows.reduce((s, r) => s + r.prize_unknown, 0);
  console.log(
    `  ${drawNo}회: ${tickets.length}게임 / 당첨 ${totalHits}건 / ${totalPrize.toLocaleString("ko-KR")}원` +
      (unknown > 0 ? ` (금액 미확인 ${unknown}건)` : "") +
      ` - 코너 ${rows.length}개, 원본 ${count ?? 0}행 정리`,
  );
}

async function main() {
  console.log("📊 생성 번호 성적 집계 시작...\n");
  const drawNos = await pendingDrawNos();
  if (drawNos.length === 0) {
    console.log("집계할 번호 없음 - 종료");
    return;
  }
  console.log(`대상 회차: ${drawNos.join(", ")}`);
  for (const drawNo of drawNos) await aggregate(drawNo);
  console.log("\n✅ 집계 완료");
}

main().catch((err) => {
  console.error("❌ 예상치 못한 오류:", err);
  process.exit(1);
});
