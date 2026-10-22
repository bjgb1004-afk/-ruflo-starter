// 입고율(%)을 사람이 읽는 한 문장으로 바꾼다.
//
// 화면에서 떼어낸 이유: 나누기가 들어 있어 입고율 0인 회차(막 발행돼 아직 아무 가게에도
// 안 들어간 경우)에 "Infinity곳 중 1곳"이 뜨는 버그가 한 번 있었다. 순수 함수로 두고
// 테스트로 못박는다.

/**
 * 이 선 아래면 "아직 가게에 덜 깔렸다"고 보고 전화 확인 안내를 띄운다.
 * 2026-10-22 실측 분포가 20·55·57·98·100%라서 "거의 다 깔린 회차(98·100)"와 "반도 안 깔린
 * 회차(20·55·57)"가 이 자리에서 갈린다.
 */
export const LOW_STOCK_RATE = 60;

/** 입고율이 이 선 아래일 때만 "가게에 전화해보라"는 안내가 쓸모 있다. 0이면 어디에도 없다. */
export function shouldSuggestCall(stockRate: number | null): boolean {
  return stockRate !== null && stockRate > 0 && stockRate < LOW_STOCK_RATE;
}

/**
 * "복권가게 5곳 중 1곳에만 들어왔어요 (입고율 20%)" 같은 문장.
 * 몇 곳 중 1곳인지는 회차마다 계산한다 - 문구를 박아두면 다른 회차에서 거짓말이 된다.
 */
export function describeStock(stockRate: number): string {
  if (!Number.isFinite(stockRate) || stockRate <= 0) return "아직 복권가게에 안 들어왔어요";
  if (stockRate >= LOW_STOCK_RATE) return `거의 모든 복권가게에 있어요 (입고율 ${stockRate}%)`;
  // 입고율 50~59%를 "1곳 중 1곳"으로 쓰면 "전부 있다"로 읽혀 정반대가 되므로 최소 2로 둔다.
  const perOne = Math.max(2, Math.round(100 / stockRate));
  return `복권가게 ${perOne}곳 중 1곳에만 들어왔어요 (입고율 ${stockRate}%)`;
}
