// 동행복권 로또 6/45 용지 QR코드 파싱.
// QR 원문은 dhlottery.co.kr 주소에 v 파라미터로 payload를 담는다. 주소 모양은 한 가지가
// 아니다 - 2026-08 실물 용지는 "https://qr.dhlottery.co.kr/?v=" 였고, 공식 사이트/앱이
// 쓰는 링크는 "https://m.dhlottery.co.kr/qr.do?method=winQr&v=" 꼴이다. 그래서 경로를
// 통째로 비교하지 않고 호스트(dhlottery.co.kr)와 v 파라미터만 본다 - 경로를 박아두면
// 발행 주소가 바뀌는 순간 모든 용지가 "인식할 수 없는 QR"이 된다.
//   payload = [회차 4자리] + ([구분자 1글자] + [번호 12자리(6개 × 2자리)]) × 게임 수(1~5)
//   예: v=1193q030915233143q111930333639q020323313941q081825304244q0208222837401336944999
//     → 회차 1193, 게임 5개(03-09-15-23-31-43 / 11-19-30-33-36-39 / ...)
//   마지막 게임 블록 뒤에 티켓 일련번호로 보이는 숫자가 더 붙어있어(검증 샘플에서 확인),
//   각 게임 블록은 앞 12자리만 번호로 쓰고 그 뒤는 무시한다.
//   구분자가 q 하나라고 단정하지 않는다 - 확보된 실물 샘플이 전부 q였을 뿐이고, 다른
//   글자가 한 번 끼면 용지 전체를 못 읽는다. 숫자가 아닌 글자면 구분자로 본다.
//   이 payload에는 구매방식(자동/수동/반자동)이 확인된 바 없어 type은 항상 null로 둔다 -
//   구분자 글자가 그 뜻일 수도 있지만 실물로 확인되기 전까지 추정하지 않는다.
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
  const text = raw.trim();
  if (!/dhlottery\.co\.kr/i.test(text)) return null;

  const payload = text.match(/[?&]v=([0-9a-z]+)/i)?.[1];
  if (!payload) return null;

  const drawNoRaw = payload.slice(0, 4);
  if (!/^[0-9]{4}$/.test(drawNoRaw)) return null;
  const drawNo = Number(drawNoRaw);
  if (drawNo <= 0) return null;

  // 회차 4자리 바로 뒤에는 게임 구분자 글자가 와야 한다. 숫자로 이어지면 아는 형식이 아니다.
  const rest = payload.slice(4);
  if (!/^[a-z]/i.test(rest)) return null;

  const gameSegments = rest.split(/[a-z]+/i).filter((s) => s.length > 0);
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

// "인식할 수 없는 QR"이 났을 때 번호(개인 데이터)는 빼고 모양만 남기기 위한 변환.
// 숫자 묶음은 자릿수로 바꾼다: ".../qr.do?method=winQr&v=<4d>q<12d>" 처럼.
export function describeQrShape(raw: string): string {
  return raw.trim().slice(0, 200).replace(/[0-9]+/g, (d) => `<${d.length}d>`);
}
