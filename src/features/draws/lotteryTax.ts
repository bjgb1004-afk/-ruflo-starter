// 국내 복권 당첨금 원천징수 규정(추정치): 5만원 이하 비과세, 5만원 초과~3억원 이하 구간
// 22%(소득세20%+지방소득세2%), 3억원 초과분은 33%(30%+3%). 구간별 세율이 다르게 적용되며
// 누진공제 개념은 없다. 실제 수령액은 세부 규정/시점에 따라 다를 수 있어 참고용 추정치다.
const TAX_EXEMPT_THRESHOLD = 50_000;
const HIGH_BRACKET_THRESHOLD = 300_000_000;
const LOW_RATE = 0.22;
const HIGH_RATE = 0.33;

export function calcNetPrizeAmount(amount: number): number {
  if (amount <= TAX_EXEMPT_THRESHOLD) return amount;
  const tax = Math.min(amount, HIGH_BRACKET_THRESHOLD) * LOW_RATE + Math.max(0, amount - HIGH_BRACKET_THRESHOLD) * HIGH_RATE;
  return Math.round(amount - tax);
}
