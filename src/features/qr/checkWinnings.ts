export type WinRank = 1 | 2 | 3 | 4 | 5 | null;

// 로또6/45 규정상 1~3등은 모두 회차별 변동(파리뮤추얼: 배당재원 ÷ 당첨자수) 금액이고,
// 4~5등만 회차와 무관한 법정 고정 금액이다. (3등을 고정금액으로 계산하던 이전 버전은 오류였음)
const FIXED_PRIZE_AMOUNT: Record<4 | 5, number> = {
  4: 50_000,
  5: 5_000,
};

// 1~3등은 draw_history의 회차별 실제 금액을, 4~5등은 고정금액을, 낙첨은 0을 반환한다.
export function getPrizeAmount(
  rank: WinRank,
  firstPrizeAmountPerWin: number | null,
  secondPrizeAmountPerWin: number | null,
  thirdPrizeAmountPerWin: number | null,
): number {
  if (rank === null) return 0;
  if (rank === 1) return firstPrizeAmountPerWin ?? 0;
  if (rank === 2) return secondPrizeAmountPerWin ?? 0;
  if (rank === 3) return thirdPrizeAmountPerWin ?? 0;
  return FIXED_PRIZE_AMOUNT[rank];
}

// 로또 6/45 표준 등수 규칙: 6개 일치 1등, 5개+보너스 2등, 5개 3등, 4개 4등, 3개 5등, 그 외 낙첨(null).
// pickedNumbers에 중복 숫자가 있으면(현재는 parseLottoQr가 미리 걸러내 실전에서는 못 만나지만,
// 이 함수 자체는 그 가정에 기대지 않는다) matchCount가 부풀려져 등수를 잘못 판정할 수 있어
// Set으로 먼저 중복을 제거한다.
export function computeWinRank(pickedNumbers: number[], winningNumbers: number[], bonusNumber: number): WinRank {
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
