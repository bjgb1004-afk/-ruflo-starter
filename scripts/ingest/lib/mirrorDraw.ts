// smok95/lotto 미러 응답을 draw_history 한 행으로 바꾼다. 네트워크와 분리해 둔 이유는
// "배당이 아직 안 붙은 응답"을 거르는 판단이 과거에 틀려서 사고가 났기 때문이다(아래).

export interface MirrorDrawResponse {
  draw_no: number;
  numbers: number[];
  bonus_no: number;
  date: string; // ISO, 예: "2026-08-08T00:00:00Z"
  divisions: { prize?: number; winners?: number }[];
  total_sales_amount?: number;
}

export interface NormalizedDraw {
  drwNo: number;
  drwNoDate: string;
  numbers: number[];
  bnusNo: number;
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

/**
 * 배당이 아직 안 붙은 응답은 null = "아직 발표 안 됨"으로 본다.
 *
 * 미러는 당첨번호를 배당보다 먼저 올린다. 1250회 실측: 20:43에 `divisions:[{},{},{},{},{}]`로
 * 번호만 올라오고 배당은 20:49에 채워졌다. 예전 코드는 `divisions[0]`이 빈 객체여도 통과시켜
 * 당첨자·당첨금이 전부 null인 행을 저장했고, 그러면
 *  - 앱이 "집계 중..."에 영구히 머문다(금액 보정도 같은 판단을 쓰므로 null을 또 덮어쓴다)
 *  - 앱오픈 트리거(trigger-draw-sync)가 "그 회차는 이미 있다"로 보고 더는 깨우지 않는다
 * 는 두 가지가 겹쳐 사람이 손으로 돌릴 때까지 안 풀린다.
 */
export function normalizeMirrorDraw(d: MirrorDrawResponse): NormalizedDraw | null {
  if (!d?.numbers || d.numbers.length !== 6) return null;

  const divisions = d.divisions ?? [];
  if (divisions.length < 5) return null;
  if (divisions.some((v) => typeof v?.prize !== "number" || typeof v?.winners !== "number")) return null;
  if (typeof d.total_sales_amount !== "number") return null;

  const [first, second, third, fourth, fifth] = divisions as { prize: number; winners: number }[];

  return {
    drwNo: d.draw_no,
    drwNoDate: d.date.split("T")[0],
    numbers: d.numbers,
    bnusNo: d.bonus_no,
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
