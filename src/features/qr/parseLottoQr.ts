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
//   묶음 앞에 붙은 글자는 단순한 구분자가 아니라 "이 묶음이 게임인가"를 알려주는 표식이다.
//   실물 두 장으로 확인된 것: q(1193회 용지, 5묶음 전부 q이고 용지도 5줄), m(2026-11-07
//   용지, m 3개 + n 2개이고 용지는 3줄 - 즉 n으로 시작하는 묶음은 게임이 아니라 용지
//   정보다). 그래서 q·m만 게임으로 읽고, 그 밖의 글자가 나오면 게임 목록이 끝난 것으로
//   보고 뒤는 무시한다. q만 받던 구현은 m 용지에서 게임을 0개로 보고 통째로 "인식 불가"를 냈다.
//   글자가 구매방식(자동/수동/반자동)을 뜻할 것으로 보이지만(q=자동, m=수동) 반자동이
//   어느 글자인지는 실물로 확인되지 않았다. 그래서 type은 여전히 null로 둔다 - 틀린 라벨은
//   없는 라벨보다 나쁘다. 반자동 용지가 들어오면 그 글자를 몰라 게임이 조용히 빠질 수 있다:
//   그때는 결과 화면의 게임 수가 용지 줄 수보다 적게 나오니, 그 신고를 받으면 아래
//   GAME_MARKERS에 글자를 추가하면 된다(화면에 읽은 원문을 보여주는 이유도 이것이다).
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

// 게임 묶음임을 알려주는 글자. 실물로 확인된 것만 넣는다(위 머리말 참고).
const GAME_MARKERS = new Set(["q", "m"]);

/** 12자리 게임 블록을 번호 6개로. 형식/범위/중복이 어긋나면 null. */
function parseGameBlock(digits: string): number[] | null {
  if (digits.length < 12) return null;
  const numbersRaw = digits.slice(0, 12); // 뒤에 붙은 일련번호 등 여분은 무시
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

  // 회차 4자리 뒤는 [글자][숫자] 묶음의 반복이어야 한다.
  const rest = payload.slice(4);
  const blocks = rest.match(/[a-z]+[0-9]+/gi) ?? [];
  if (blocks.length === 0) return { ok: false, reason: "no-blocks-after-draw-no" };

  const games: ParsedLottoGame[] = [];
  for (const [i, block] of blocks.entries()) {
    const marker = block[0].toLowerCase();
    if (!GAME_MARKERS.has(marker)) break; // 게임 목록 끝 - 뒤는 용지 정보다
    const digits = block.replace(/^[a-z]+/i, "");
    const numbers = parseGameBlock(digits);
    if (!numbers) {
      return { ok: false, reason: `block-${i + 1}-of-${blocks.length}-marker-${marker}-invalid(len=${digits.length})` };
    }
    games.push({ numbers, type: null });
  }

  if (games.length < 1) return { ok: false, reason: `no-game-markers(first=${blocks[0]?.[0]?.toLowerCase() ?? "?"})` };
  if (games.length > 5) return { ok: false, reason: `too-many-games(${games.length})` };

  return { ok: true, value: { drawNo, games } };
}

export function parseLottoQr(raw: string): ParsedLottoQr | null {
  const result = parse(raw);
  return result.ok ? result.value : null;
}

// "인식할 수 없는 QR"이 났을 때 번호(개인 데이터)는 빼고 모양과 이유만 남긴다.
// 숫자 묶음은 자릿수로 바꾼다: "...?v=<4d>m<12d>n<30d> | no-game-markers(first=n)".
export function describeQrShape(raw: string): string {
  const shape = raw.trim().slice(0, 200).replace(/[0-9]+/g, (d) => `<${d.length}d>`);
  const result = parse(raw);
  return result.ok ? shape : `${shape} | ${result.reason}`;
}
