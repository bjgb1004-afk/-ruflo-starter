// smok95/lotto 미러 응답을 draw_history에 넣을 모양으로 바꾼다. 네트워크와 분리해 둔 이유는
// "배당이 아직 안 붙은 응답"을 어떻게 다룰지가 실제로 사고가 났던 지점이기 때문이다(아래).

export interface MirrorDrawResponse {
  draw_no: number;
  numbers: number[];
  bonus_no: number;
  date: string; // ISO, 예: "2026-08-08T00:00:00Z"
  divisions: { prize?: number; winners?: number }[];
  total_sales_amount?: number;
}

/**
 * 1~5등 배당. 1~3등은 파리뮤추얼(판매액 분배)이라 추첨 방송 직후엔 아직 확정 전이고,
 * 미러에도 몇 분 뒤에야 붙는다. 그래서 당첨번호와 따로 다룬다.
 */
export interface DrawPrizes {
  firstPrizeAmountPerWin: number;
  firstPrizeWinnerCount: number;
  firstPrizeTotalAmount: number;
  secondPrizeAmountPerWin: number;
  secondPrizeWinnerCount: number;
  thirdPrizeAmountPerWin: number;
  thirdPrizeWinnerCount: number;
  fourthPrizeWinnerCount: number;
  fifthPrizeWinnerCount: number;
  totalSalesAmount: number;
}

export interface NormalizedDraw {
  drwNo: number;
  drwNoDate: string;
  numbers: number[];
  bnusNo: number;
  /** 아직 집계 전이면 null. 당첨번호는 그대로 먼저 저장하고 배당만 뒤에 채운다. */
  prizes: DrawPrizes | null;
}

/**
 * 당첨번호가 배당보다 먼저 오는 것은 정상이고, 그 상태로 저장하는 것도 맞다
 * (유저는 금액보다 번호를 먼저 보고 싶어 한다). 대신 **배당을 null로 덮어쓰면 안 된다** -
 * 이미 채워진 회차를 다시 조회했을 때 빈 응답이 오면 멀쩡한 금액이 지워진다.
 *
 * 1250회(2026-11-14) 실측: 20:43에 `divisions:[{},{},{},{},{}]`로 번호만 올라오고
 * 배당은 20:49에 채워졌다. 예전 코드는 이 빈 배당을 "0/undefined"로 받아 그대로 저장해
 * 당첨자·당첨금이 전부 null인 행을 만들었고, 금액 보정도 같은 판단을 써서 null을 또
 * 덮어썼다. 그래서 앱이 "집계 중..."에 한 시간 넘게 멈춰 있었다.
 */
export function normalizeMirrorDraw(d: MirrorDrawResponse): NormalizedDraw | null {
  if (!d?.numbers || d.numbers.length !== 6) return null;

  return {
    drwNo: d.draw_no,
    drwNoDate: d.date.split("T")[0],
    numbers: d.numbers,
    bnusNo: d.bonus_no,
    prizes: readPrizes(d),
  };
}

/** 1~5등이 전부 숫자로 채워졌을 때만 배당으로 인정한다. 하나라도 비면 "아직 집계 중". */
function readPrizes(d: MirrorDrawResponse): DrawPrizes | null {
  const divisions = d.divisions ?? [];
  if (divisions.length < 5) return null;
  if (divisions.some((v) => typeof v?.prize !== "number" || typeof v?.winners !== "number")) return null;
  if (typeof d.total_sales_amount !== "number") return null;

  const [first, second, third, fourth, fifth] = divisions as { prize: number; winners: number }[];

  return {
    firstPrizeAmountPerWin: first.prize,
    firstPrizeWinnerCount: first.winners,
    firstPrizeTotalAmount: first.prize * first.winners,
    secondPrizeAmountPerWin: second.prize,
    secondPrizeWinnerCount: second.winners,
    thirdPrizeAmountPerWin: third.prize,
    thirdPrizeWinnerCount: third.winners,
    fourthPrizeWinnerCount: fourth.winners,
    fifthPrizeWinnerCount: fifth.winners,
    totalSalesAmount: d.total_sales_amount,
  };
}

/** draw_history의 배당 칸들. 배당이 없을 때는 아예 안 보내 기존 값을 건드리지 않는다. */
export function prizeColumns(p: DrawPrizes) {
  return {
    first_prize_total_amount: p.firstPrizeTotalAmount,
    first_prize_winner_count: p.firstPrizeWinnerCount,
    first_prize_amount_per_win: p.firstPrizeAmountPerWin,
    second_prize_amount_per_win: p.secondPrizeAmountPerWin,
    second_prize_winner_count: p.secondPrizeWinnerCount,
    third_prize_amount_per_win: p.thirdPrizeAmountPerWin,
    third_prize_winner_count: p.thirdPrizeWinnerCount,
    fourth_prize_winner_count: p.fourthPrizeWinnerCount,
    fifth_prize_winner_count: p.fifthPrizeWinnerCount,
    total_sales_amount: p.totalSalesAmount,
  };
}
