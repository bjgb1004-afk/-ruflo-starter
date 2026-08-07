// 동행복권 로또 6/45 용지 QR코드 파싱.
// QR 원문 형식: "http(s)://m.dhlottery.co.kr/?v=" + 숫자열
//   숫자열 = [회차 4자리][게임 수 2자리][게임 블록 × 게임 수]
//   게임 블록(13자리) = [구분 1자리: 0=자동,1=수동,2=반자동][번호 6개 × 2자리]
// 이 형식은 공식 스펙 문서가 공개되어 있지 않아, 실제 용지로 검증 전까지는 파싱 실패 시
// (형식 불일치/번호 범위 이상/중복 번호) 절대 임의의 결과를 만들지 않고 null을 반환한다.
export type GameType = "자동" | "수동" | "반자동";

export interface ParsedLottoGame {
  numbers: number[];
  type: GameType | null;
}

export interface ParsedLottoQr {
  drawNo: number;
  games: ParsedLottoGame[];
}

const GAME_TYPE_MAP: Record<string, GameType> = { "0": "자동", "1": "수동", "2": "반자동" };

export function parseLottoQr(raw: string): ParsedLottoQr | null {
  const match = raw.trim().match(/dhlottery\.co\.kr\/\?v=(\d+)/i);
  if (!match) return null;

  const digits = match[1];
  if (digits.length < 6) return null;

  const drawNo = Number(digits.slice(0, 4));
  const gameCount = Number(digits.slice(4, 6));
  if (!Number.isInteger(drawNo) || drawNo <= 0) return null;
  if (!Number.isInteger(gameCount) || gameCount < 1 || gameCount > 5) return null;

  const expectedLength = 6 + gameCount * 13;
  if (digits.length !== expectedLength) return null;

  const games: ParsedLottoGame[] = [];
  let cursor = 6;
  for (let i = 0; i < gameCount; i++) {
    const typeDigit = digits[cursor];
    const numbersRaw = digits.slice(cursor + 1, cursor + 13);
    cursor += 13;

    const numbers: number[] = [];
    for (let j = 0; j < 6; j++) {
      const n = Number(numbersRaw.slice(j * 2, j * 2 + 2));
      if (!Number.isInteger(n) || n < 1 || n > 45) return null;
      numbers.push(n);
    }
    if (new Set(numbers).size !== 6) return null;

    games.push({ numbers: numbers.sort((a, b) => a - b), type: GAME_TYPE_MAP[typeDigit] ?? null });
  }

  return { drawNo, games };
}
