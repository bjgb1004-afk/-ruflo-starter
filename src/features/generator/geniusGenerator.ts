import { PI_DIGITS, E_DIGITS } from "./mathDigits";

// 천재 수학자 5인의 방식으로 로또 번호를 만드는 순수 모듈(React/Expo 의존 없음).
//
// 천재 1명이 한 회차에 A~E 5게임을 낸다. 시드가 "회차|천재"로 고정돼 있어서, 같은 주에는
// 누가 언제 실행해도 같은 5게임이 나온다. 스레드(gzclab-threads/lotto_gen.py)는 월~금에
// 천재 1명씩 이 5게임을 올리고, 앱은 같은 번호를 보여준다. 두 구현은 비트 단위로 같아야
// 하며, 테스트의 GOLDEN 값이 양쪽에 똑같이 박혀 있다 - 한쪽만 바꾸면 테스트가 깨진다.
//
// 어떤 방식도 당첨 확률을 바꾸지 않는다(모든 조합은 똑같이 1/8,145,060). 화면과 게시글에서는
// "천재의 수학으로 만든 번호"까지만 표현하고 "예측"이라고 하지 않는다.

export type GeniusId = "archimedes" | "fibonacci" | "pascal" | "euler" | "gauss";

export interface GeniusInfo {
  id: GeniusId;
  name: string;
  // 스레드 요일 배정. 0=월 … 4=금 (토요일은 명당 번호).
  weekday: number;
  achievement: string;
  method: string;
}

export const GENIUSES: readonly GeniusInfo[] = [
  {
    id: "archimedes",
    name: "아르키메데스",
    weekday: 0,
    achievement: "원주율 π를 처음으로 정밀하게 계산",
    method: "π의 소수점 아래 자릿수를 이어 읽으며 두 자리씩 잘라 1~45만 골랐어요.",
  },
  {
    id: "fibonacci",
    name: "피보나치",
    weekday: 1,
    achievement: "피보나치 수열과 황금비",
    method: "황금비(0.618…) 간격으로 45칸 원을 돌며 번호를 골랐어요.",
  },
  {
    id: "pascal",
    name: "파스칼",
    weekday: 2,
    achievement: "확률론의 창시자, 파스칼의 삼각형",
    method: "파스칼 삼각형의 줄들을 45로 나눈 나머지로 번호를 골랐어요.",
  },
  {
    id: "euler",
    name: "오일러",
    weekday: 3,
    achievement: "자연상수 e를 세상에 알린 수학자",
    method: "e의 소수점 아래 자릿수를 이어 읽으며 두 자리씩 잘라 1~45만 골랐어요.",
  },
  {
    id: "gauss",
    name: "가우스",
    weekday: 4,
    achievement: "정규분포(종 모양 곡선)의 아버지",
    method: "여섯 번호의 합이 평균 138에 가장 가까운 조합 5개를 골랐어요.",
  },
];

export const GAMES_PER_SET = 5;

// ---------- 날짜/회차 ----------

// drawReminders.ts의 FIRST_DRAW_MS와 같은 값. 그 파일은 expo-notifications를 import하므로
// 이 모듈을 테스트에서 가볍게 쓰려고 여기 따로 둔다.
const FIRST_DRAW_MS = Date.parse("2002-12-07T20:45:00+09:00");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 지금 시점에 구매 대상인 회차 = 추첨 시각이 아직 오지 않은 가장 이른 회차.
export function upcomingDrawNo(now: Date = new Date()): number {
  const elapsed = now.getTime() - FIRST_DRAW_MS;
  if (elapsed < 0) return 1;
  return Math.floor(elapsed / WEEK_MS) + 2;
}

// 오늘(KST) 스레드에 올라가는 천재. 토·일은 null(토요일은 명당 번호 날).
export function geniusOfToday(now: Date = new Date()): GeniusInfo | null {
  const kstDay = new Date(now.getTime() + KST_OFFSET_MS).getUTCDay(); // 0=일 … 6=토
  const weekday = (kstDay + 6) % 7; // 0=월 … 6=일
  return GENIUSES.find((g) => g.weekday === weekday) ?? null;
}

// ---------- 결정론적 난수 ----------

function hashString(s: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 공통 필터 ----------

export function comboKey(numbers: readonly number[]): string {
  return [...numbers].sort((a, b) => a - b).join(",");
}

// 합계 100~175, 홀짝 6:0/0:6 제외, 연속번호 3개 이상 제외.
export function passesCommonFilters(numbers: readonly number[]): boolean {
  if (numbers.length !== 6 || new Set(numbers).size !== 6) return false;
  if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 45)) return false;
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = sorted.reduce((s, n) => s + n, 0);
  if (sum < 100 || sum > 175) return false;
  const odd = sorted.filter((n) => n % 2 === 1).length;
  if (odd === 0 || odd === 6) return false;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    if (run >= 3) return false;
  }
  return true;
}

type Accept = (numbers: number[]) => boolean;

function sortAsc(numbers: number[]): number[] {
  return [...numbers].sort((a, b) => a - b);
}

function randomCombo(rng: () => number, accept: Accept): number[] {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const pool = Array.from({ length: 45 }, (_, i) => i + 1);
    for (let i = 0; i < 6; i++) {
      const j = i + Math.floor(rng() * (45 - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const pick = sortAsc(pool.slice(0, 6));
    if (accept(pick)) return pick;
  }
  throw new Error("randomCombo: no valid combination found");
}

// ---------- 천재별 방식 ----------

// pos부터 두 자리씩 읽어 01~45만 채택. [조합, 다음 읽을 위치]. 실패하면 두 칸 밀고 다시.
function fromDigits(digits: string, start: number, accept: Accept): [number[] | null, number] {
  const len = digits.length;
  let pos = start % len;
  for (let attempt = 0; attempt < 500; attempt++) {
    const picked: number[] = [];
    let p = pos;
    for (let steps = 0; steps < 200 && picked.length < 6; steps++) {
      const n = Number(digits[p % len] + digits[(p + 1) % len]);
      p += 2;
      if (n >= 1 && n <= 45 && !picked.includes(n)) picked.push(n);
    }
    const sorted = sortAsc(picked);
    if (picked.length === 6 && accept(sorted)) return [sorted, p % len];
    pos = (pos + 2) % len;
  }
  return [null, pos];
}

const PHI_FRAC = (Math.sqrt(5) - 1) / 2; // 0.6180339887…

function fibonacciOne(rng: () => number, accept: Accept): number[] | null {
  for (let attempt = 0; attempt < 500; attempt++) {
    const u0 = rng();
    const picked: number[] = [];
    for (let k = 0; k < 100 && picked.length < 6; k++) {
      const n = Math.floor(((u0 + k * PHI_FRAC) % 1) * 45) + 1;
      if (!picked.includes(n)) picked.push(n);
    }
    const sorted = sortAsc(picked);
    if (picked.length === 6 && accept(sorted)) return sorted;
  }
  return null;
}

function pascalRowMod45(row: number): number[] {
  let cur = [1];
  for (let r = 1; r <= row; r++) {
    const next = new Array<number>(r + 1).fill(1);
    for (let k = 1; k < r; k++) next[k] = (cur[k - 1] + cur[k]) % 45;
    cur = next;
  }
  return cur;
}

function pascalGames(drawNo: number, accept: Accept, count: number): number[][] {
  const base = 20 + ((drawNo * 7) % 80); // 20~99번째 줄에서 출발
  const games: number[][] = [];
  let offset = 0;
  while (games.length < count && offset < 1000) {
    const row = 20 + ((base - 20 + offset) % 130);
    offset += 1;
    const values = pascalRowMod45(row);
    const inner = row - 1; // 양 끝의 1을 뺀 칸 수
    const start = 1 + (drawNo % inner);
    const picked: number[] = [];
    for (let i = 0; i < inner && picked.length < 6; i++) {
      const n = values[1 + ((start - 1 + i) % inner)] + 1;
      if (!picked.includes(n)) picked.push(n);
    }
    const sorted = sortAsc(picked);
    // 서로 다른 줄이 같은 조합을 낼 수 있다(1234회에서 실제로 겹침). 이미 뽑은 것은 건너뛴다.
    const key = comboKey(sorted);
    if (picked.length === 6 && accept(sorted) && !games.some((g) => comboKey(g) === key)) games.push(sorted);
  }
  return games;
}

const GAUSS_TARGET_SUM = 138; // 1~45에서 6개 합의 기대값 = 6 × 23

function gaussGames(rng: () => number, accept: Accept, count: number): number[][] {
  const cands: number[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const pick = randomCombo(rng, accept);
    const key = comboKey(pick);
    if (!seen.has(key)) {
      seen.add(key);
      cands.push(pick);
    }
  }
  const gap = (c: number[]) => Math.abs(c.reduce((s, n) => s + n, 0) - GAUSS_TARGET_SUM);
  // 합이 138에 가까운 순, 동점이면 먼저 나온 것. 엔진의 정렬 안정성에 기대지 않고 인덱스로 고정.
  return cands
    .map((c, i) => ({ c, i, g: gap(c) }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .slice(0, count)
    .map((x) => x.c);
}

// ---------- 진입점 ----------

// 그 회차 그 천재의 A~E 5게임. 같은 입력이면 언제나 같은 결과.
export function generateGeniusGames(
  geniusId: GeniusId,
  drawNo: number,
  excludeCombos?: ReadonlySet<string>,
): number[][] {
  const used = new Set<string>();
  const accept: Accept = (nums) => {
    if (!passesCommonFilters(nums)) return false;
    const key = comboKey(nums);
    return !used.has(key) && !excludeCombos?.has(key);
  };
  const rng = mulberry32(hashString(`${drawNo}|${geniusId}`));
  const games: number[][] = [];
  const take = (g: number[]) => {
    used.add(comboKey(g));
    games.push(g);
  };

  if (geniusId === "archimedes" || geniusId === "euler") {
    const digits = geniusId === "archimedes" ? PI_DIGITS : E_DIGITS;
    let pos = drawNo * (geniusId === "archimedes" ? 37 : 41);
    for (let i = 0; i < GAMES_PER_SET; i++) {
      const [g, next] = fromDigits(digits, pos, accept);
      if (!g) break;
      take(g);
      pos = next;
    }
  } else if (geniusId === "fibonacci") {
    for (let i = 0; i < GAMES_PER_SET; i++) {
      const g = fibonacciOne(rng, accept);
      if (!g) break;
      take(g);
    }
  } else if (geniusId === "pascal") {
    pascalGames(drawNo, accept, GAMES_PER_SET).forEach(take);
  } else {
    gaussGames(rng, accept, GAMES_PER_SET).forEach(take);
  }

  while (games.length < GAMES_PER_SET) take(randomCombo(rng, accept));
  return games;
}

// 명당(판매점이나 지역) 이름으로 뽑는 1게임. 같은 주에는 같은 번호. 스레드 자동답글과 같은 규칙.
export function generateStoreGame(key: string, drawNo: number): number[] {
  const rng = mulberry32(hashString(`${drawNo}|store|${key}`));
  return randomCombo(rng, passesCommonFilters);
}
