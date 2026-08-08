// 동행복권 로또 6/45 용지 QR코드 파싱.
// QR 원문 형식(실제 용지로 검증됨): "https://qr.dhlottery.co.kr/?v=" + payload
//   payload = [회차 4자리] + ("q" + [게임 블록 12자리(번호 6개 × 2자리)]) × 게임 수(1~5)
//   예: v=1193q030915233143q111930333639q020323313941q081825304244q0208222837401336944999
//     → 회차 1193, 게임 5개(03-09-15-23-31-43 / 11-19-30-33-36-39 / ...)
//   마지막 게임 블록 뒤에 티켓 일련번호로 보이는 숫자가 더 붙어있어(검증 샘플에서 확인),
//   각 게임 블록은 앞 12자리만 번호로 쓰고 그 뒤는 무시한다.
//   이 payload에는 구매방식(자동/수동/반자동) 구분자가 없어 항상 null로 둔다 - 다른 실물
//   샘플로 구분자 위치가 확인되기 전까지는 임의로 추정하지 않는다.
// 파싱 실패 시(형식 불일치/번호 범위 이상/중복 번호) 절대 임의의 결과를 만들지 않고 null을 반환한다.
export type GameType = "자동" | "수동" | "반자동";

export interface ParsedLottoGame {
  numbers: number[];
  type: GameType | null;
}

export interface ParsedLottoQr {
  drawNo: number;
  games: ParsedLottoGame[];
}

export function parseLottoQr(raw: string): ParsedLottoQr | null {
  const match = raw.trim().match(/dhlottery\.co\.kr\/\?v=([0-9q]+)/i);
  if (!match) return null;

  const segments = match[1].split("q");
  const drawNoRaw = segments[0];
  if (drawNoRaw.length !== 4) return null;

  const drawNo = Number(drawNoRaw);
  if (!Number.isInteger(drawNo) || drawNo <= 0) return null;

  const gameSegments = segments.slice(1);
  if (gameSegments.length < 1 || gameSegments.length > 5) return null;

  const games: ParsedLottoGame[] = [];
  for (const segment of gameSegments) {
    if (segment.length < 12) return null;
    const numbersRaw = segment.slice(0, 12); // 마지막 블록 뒤 일련번호 등 여분은 무시

    const numbers: number[] = [];
    for (let j = 0; j < 6; j++) {
      const n = Number(numbersRaw.slice(j * 2, j * 2 + 2));
      if (!Number.isInteger(n) || n < 1 || n > 45) return null;
      numbers.push(n);
    }
    if (new Set(numbers).size !== 6) return null;

    games.push({ numbers: numbers.sort((a, b) => a - b), type: null });
  }

  return { drawNo, games };
}
