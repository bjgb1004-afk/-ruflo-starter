import { GENIUSES } from "./geniusGenerator";
import { BAND_SOURCE } from "./recordGeneratedTickets";

// 수학 분석 코너 이름. 생성기 화면의 칩 이름과 집계 라벨이 갈라지지 않게 여기 한 곳에만 둔다.
export const MATH_CHIPS: Record<string, string> = {
  archimedes: "아르키메데스",
  pascal: "파스칼",
  fibonacci: "피보나치",
  gaussian: "가우시안",
  euler: "오일러",
};

// 집계에 들어간 코너 이름을 사람이 읽는 말로 바꾼다. 모르는 값이 와도 화면이 깨지지 않게
// 그대로 돌려준다(새 코너를 추가하고 이 함수를 깜빡해도 숫자는 보여야 한다).
export function sourceLabel(source: string): string {
  if (source === BAND_SOURCE) return "번호대 분석";
  const [kind, id] = source.split(":");
  if (kind === "genius") return `천재들의 한수 · ${GENIUSES.find((g) => g.id === id)?.name ?? id}`;
  if (kind === "math") return `수학 분석 · ${MATH_CHIPS[id] ?? id}`;
  return source;
}
