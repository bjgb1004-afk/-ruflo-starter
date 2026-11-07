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
//   구분자는 q 하나가 아니다. 2026-11-07 실물 용지는 m과 n을 썼다(에러 로그에 찍힌 모양:
//   v=<4d>m<12d>m<12d>m<12d>n<12d>n<30d>). 그래서 숫자가 아닌 글자면 전부 구분자로 본다 -
//   q만 받던 구현은 이 용지에서 게임을 0개로 보고 통째로 "인식 불가"를 냈다.
//   글자가 구매방식(자동/수동/반자동)을 뜻할 가능성이 크지만 어느 글자가 무엇인지 실물로
//   확인되지 않았으므로 type은 여전히 null로 둔다 - 틀린 라벨은 없는 라벨보다 나쁘다.
//   일련번호 묶음이 자기 구분자를 달고 따로 떨어져 나오기도 한다(위 모양의 마지막 n<30d>).
//   마지막 묶음이 게임으로 안 읽히면 일련번호로 보고 버린다 - 그것 때문에 용지 전체를
//   못 읽는 건 말이 안 된다. 중간 묶음이 깨진 경우는 여전히 전체 실패다(게임을 조용히
//   잃는 것보다 안 읽는 쪽이 안전하다).
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

export interface QrFailure {
  ok: false;
  /** 로그에 남길 짧은 실패 이유. 번호 자체는 넣지 않는다. */
  reason: string;
}

/** 12자리 게임 블록을 번호 6개로. 형식/범위/중복이 어긋나면 null. */
function parseGameBlock(segment: string): number[] | null {
  if (segment.length < 12) return null;
  const numbersRaw = segment.slice(0, 12); // 뒤에 붙은 일련번호 등 여분은 무시
  const numbers: number[] = [];
  for (let j = 0; j < 6; j++) {
    const n = Number(numbersRaw.slice(j * 2, j * 2 + 2));
    if (!Number.isInteger(n) || n < 1 || n > 45) return null;
    numbers.push(n);
  }
  if (new Set(numbers).size !== 6) return null;
  return numbers.sort((a, b) => a - b);
}

function parse(raw: string): { ok: true; value: ParsedLottoQr } | QrFailure {
  const text = raw.trim();
  if (!/dhlottery\.co\.kr/i.test(text)) return { ok: false, reason: "not-a-dhlottery-url" };

  const payload = text.match(/[?&]v=([0-9a-z]+)/i)?.[1];
  if (!payload) return { ok: false, reason: "no-v-parameter" };

  const drawNoRaw = payload.slice(0, 4);
  if (!/^[0-9]{4}$/.test(drawNoRaw)) return { ok: false, reason: "draw-no-not-4-digits" };
  const drawNo = Number(drawNoRaw);
  if (drawNo <= 0) return { ok: false, reason: "draw-no-zero" };

  // 회차 4자리 바로 뒤에는 게임 구분자 글자가 와야 한다. 숫자로 이어지면 아는 형식이 아니다.
  const rest = payload.slice(4);
  if (!/^[a-z]/i.test(rest)) return { ok: false, reason: "no-separator-after-draw-no" };

  const segments = rest.split(/[a-z]+/i).filter((s) => s.length > 0);
  const games: ParsedLottoGame[] = [];
  for (let i = 0; i < segments.length; i++) {
    const numbers = parseGameBlock(segments[i]);
    if (!numbers) {
      // 마지막 묶음이 게임이 아니면 일련번호로 본다(위 머리말 참고).
      if (i === segments.length - 1 && games.length > 0) break;
      return { ok: false, reason: `block-${i + 1}-of-${segments.length}-invalid(len=${segments[i].length})` };
    }
    games.push({ numbers, type: null });
  }

  if (games.length < 1) return { ok: false, reason: "no-game-blocks" };
  if (games.length > 5) return { ok: false, reason: `too-many-games(${games.length})` };

  return { ok: true, value: { drawNo, games } };
}

export function parseLottoQr(raw: string): ParsedLottoQr | null {
  const result = parse(raw);
  return result.ok ? result.value : null;
}

// "인식할 수 없는 QR"이 났을 때 번호(개인 데이터)는 빼고 모양과 이유만 남긴다.
// 숫자 묶음은 자릿수로 바꾼다: "...?v=<4d>m<12d>n<30d> | block-5-of-5-invalid(len=30)".
export function describeQrShape(raw: string): string {
  const shape = raw.trim().slice(0, 200).replace(/[0-9]+/g, (d) => `<${d.length}d>`);
  const result = parse(raw);
  return result.ok ? shape : `${shape} | ${result.reason}`;
}
