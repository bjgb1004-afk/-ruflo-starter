// 번호대(구간) 분석 방식으로 로또 번호를 만드는 순수 모듈.
//
// 앱과 스레드 자동화(gzclab-threads)가 같은 번호를 내야 하므로 React/Expo는 물론 이 저장소의
// 다른 파일도 import하지 않는다 - 이 파일 하나만 복사하면 어디서든 그대로 돈다. 같은 이유로
// 난수기(mulberry32)와 등수 판정도 geniusGenerator.ts / qr/checkWinnings.ts에서 가져오지 않고
// 여기 다시 적었다. 등수 규칙이 양쪽에서 갈라지면 테스트가 잡는다(bandGenerator.test.ts).
//
// 어떤 방식도 당첨 확률을 바꾸지 않는다(모든 조합이 똑같이 1/8,145,060). 화면·게시글에서
// "확률을 높인다"는 표현은 쓰지 않는다.

/** 번호대 5구간. [시작, 끝] 모두 포함. */
export const BANDS: readonly (readonly [number, number])[] = [
  [1, 9],
  [10, 19],
  [20, 29],
  [30, 39],
  [40, 45],
];

/** 저(低) 구간의 상한. 1~22가 저, 23~45가 고. */
const LOW_MAX = 22;

/** 허용하는 저:고 비율. */
const ALLOWED_LOW_COUNTS: readonly number[] = [2, 3, 4];

export const GAMES_PER_SET = 5;

/** 한 게임을 뽑는 데 허용하는 최대 시도 횟수. 조건이 까다로워도 무한루프로 앱이 멈추지 않게 한다. */
const MAX_ATTEMPTS_PER_GAME = 10_000;

export interface BandGame {
  /** 1~45 중 중복 없는 6개, 오름차순. */
  numbers: number[];
  /** 구간별 개수 (BANDS 순서). */
  bandCounts: number[];
  /** 구간 분포 표기. 예: "1-2-1-1-1" */
  bandPattern: string;
  /** 1~22 개수. */
  lowCount: number;
  /** 23~45 개수. */
  highCount: number;
  /** 저:고 표기. 예: "3:3" */
  lowHighRatio: string;
}

// ---------- 분석 ----------

function bandIndexOf(n: number): number {
  for (let i = 0; i < BANDS.length; i++) {
    if (n >= BANDS[i][0] && n <= BANDS[i][1]) return i;
  }
  return -1;
}

/** 번호 6개의 구간 분포·저고 비율을 계산한다. 조건 충족 여부는 보지 않는다. */
export function analyzeGame(numbers: readonly number[]): BandGame {
  const sorted = [...numbers].sort((a, b) => a - b);
  const bandCounts = new Array<number>(BANDS.length).fill(0);
  for (const n of sorted) {
    const i = bandIndexOf(n);
    if (i >= 0) bandCounts[i] += 1;
  }
  const lowCount = sorted.filter((n) => n <= LOW_MAX).length;
  const highCount = sorted.length - lowCount;
  return {
    numbers: sorted,
    bandCounts,
    bandPattern: bandCounts.join("-"),
    lowCount,
    highCount,
    lowHighRatio: `${lowCount}:${highCount}`,
  };
}

/**
 * 채택 조건.
 * 1) 5개 구간 중 정확히 1개 구간이 0개
 * 2) 한 구간에 최대 3개
 * 3) 저(1~22):고(23~45) 비율이 2:4, 3:3, 4:2 중 하나
 */
export function satisfiesBandRules(numbers: readonly number[]): boolean {
  if (numbers.length !== 6 || new Set(numbers).size !== 6) return false;
  if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 45)) return false;

  const { bandCounts, lowCount } = analyzeGame(numbers);
  const emptyBands = bandCounts.filter((c) => c === 0).length;
  if (emptyBands !== 1) return false;
  if (bandCounts.some((c) => c > 3)) return false;
  return ALLOWED_LOW_COUNTS.includes(lowCount);
}

// ---------- 난수 ----------

export type Rng = () => number;

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

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열 시드로 재현 가능한 난수기를 만든다. 같은 시드면 항상 같은 수열. */
export function seededRng(seed: string): Rng {
  return mulberry32(hashString(seed));
}

// ---------- 생성 ----------

function comboKey(numbers: readonly number[]): string {
  return [...numbers].sort((a, b) => a - b).join(",");
}

function drawSix(rng: Rng): number[] {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  for (let i = 0; i < 6; i++) {
    const j = i + Math.floor(rng() * (45 - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 6).sort((a, b) => a - b);
}

/**
 * 조건을 만족하는 5게임을 만든다. 5게임끼리 같은 조합은 나오지 않는다.
 * rng를 주지 않으면 Math.random - "다시 뽑기"는 매번 완전히 새로운 번호가 된다.
 * 시도 상한에 걸리면(사실상 불가능) 만든 만큼만 돌려주지 않고 던진다 - 5게임이 아닌 결과가
 * 조용히 화면에 나가는 것보다 드러내는 편이 낫다.
 */
export function generateBandGames(rng: Rng = Math.random, count: number = GAMES_PER_SET): BandGame[] {
  const used = new Set<string>();
  const games: BandGame[] = [];

  while (games.length < count) {
    let picked: number[] | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_GAME; attempt++) {
      const candidate = drawSix(rng);
      if (!satisfiesBandRules(candidate)) continue;
      if (used.has(comboKey(candidate))) continue;
      picked = candidate;
      break;
    }
    if (!picked) {
      throw new Error(`generateBandGames: ${MAX_ATTEMPTS_PER_GAME}번 안에 조건에 맞는 조합을 찾지 못했다`);
    }
    used.add(comboKey(picked));
    games.push(analyzeGame(picked));
  }

  return games;
}

/**
 * 날짜(YYYY-MM-DD)를 시드로 쓰는 "오늘의 추천". 같은 날짜면 앱에서 보든 스레드에서 보든
 * 언제 실행해도 같은 5게임이 나온다.
 */
export function generateDailyBandGames(dateKey: string, count: number = GAMES_PER_SET): BandGame[] {
  return generateBandGames(seededRng(`band|${dateKey}`), count);
}

/** 지금 시각(KST)의 날짜 키. generateDailyBandGames의 입력으로 쓴다. */
export function kstDateKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// ---------- 당첨 대조 ----------

export type WinRank = 1 | 2 | 3 | 4 | 5 | null;

export interface BandGameResult extends BandGame {
  /** 당첨번호 6개와 겹치는 개수(보너스 제외). */
  matchCount: number;
  hasBonus: boolean;
  rank: WinRank;
}

/** 로또 6/45 표준 등수 규칙. qr/checkWinnings.ts의 computeWinRank와 같아야 한다. */
function rankOf(matchCount: number, hasBonus: boolean): WinRank {
  if (matchCount === 6) return 1;
  if (matchCount === 5 && hasBonus) return 2;
  if (matchCount === 5) return 3;
  if (matchCount === 4) return 4;
  if (matchCount === 3) return 5;
  return null;
}

/** 5게임이 그 회차 당첨번호와 몇 개씩 맞았는지 계산한다. */
export function checkBandGames(
  games: readonly BandGame[],
  winningNumbers: readonly number[],
  bonusNumber: number,
): BandGameResult[] {
  const winningSet = new Set(winningNumbers);
  return games.map((game) => {
    const unique = new Set(game.numbers);
    const matchCount = [...unique].filter((n) => winningSet.has(n)).length;
    const hasBonus = unique.has(bonusNumber);
    return { ...game, matchCount, hasBonus, rank: rankOf(matchCount, hasBonus) };
  });
}

// ---------- 게시글 텍스트 ----------

/** 스레드 글자 수 상한. */
export const THREAD_MAX_CHARS = 500;

const LETTERS = ["A", "B", "C", "D", "E"];

function joinNumbers(numbers: readonly number[]): string {
  return numbers.map((n) => String(n).padStart(2, "0")).join(" ");
}

/** 길이 상한을 넘으면 뒤에서부터 줄을 덜어낸다. 해시태그 줄은 남긴다. */
function fitToLimit(head: string[], body: string[], tail: string[], limit: number): string {
  const lines = [...body];
  while (lines.length > 0) {
    const text = [...head, ...lines, ...tail].join("\n");
    if (text.length <= limit) return text;
    lines.pop();
  }
  return [...head, ...tail].join("\n").slice(0, limit);
}

/**
 * 스레드 게시용 텍스트. 제목 + 5게임(번호/구간분포/저고비율) + 앱 유도 + 해시태그.
 * 항상 THREAD_MAX_CHARS 이하로 돌려준다.
 */
export function formatThreadPost(
  games: readonly BandGame[],
  options: { dateKey?: string; drawNo?: number } = {},
): string {
  const { dateKey, drawNo } = options;
  const title = drawNo ? `${drawNo}회 번호대 분석 5게임` : "오늘의 번호대 분석 5게임";
  const head = [dateKey ? `${title} (${dateKey})` : title, ""];
  const body = games.map((g, i) => `${LETTERS[i]} ${joinNumbers(g.numbers)} | ${g.bandPattern} | 저고 ${g.lowHighRatio}`);
  const tail = ["", "구간 분포와 저고 비율을 맞춰 뽑은 번호예요. 당첨 확률은 어떤 조합이든 같아요.", "#로또 #번호생성 #번호대분석"];
  return fitToLimit(head, body, tail, THREAD_MAX_CHARS);
}

/** 결과 공개용 텍스트. 각 게임이 몇 개 맞았는지와 등수를 적는다. */
export function formatResultPost(
  results: readonly BandGameResult[],
  options: { drawNo: number; winningNumbers: readonly number[]; bonusNumber: number },
): string {
  const { drawNo, winningNumbers, bonusNumber } = options;
  const head = [
    `${drawNo}회 결과 확인`,
    `당첨번호 ${joinNumbers([...winningNumbers].sort((a, b) => a - b))} + ${String(bonusNumber).padStart(2, "0")}`,
    "",
  ];
  const body = results.map((r, i) => {
    const rankText = r.rank ? `${r.rank}등` : "아쉽";
    const bonusText = r.matchCount === 5 && r.hasBonus ? "+보너스" : "";
    return `${LETTERS[i]} ${joinNumbers(r.numbers)} | ${r.matchCount}개${bonusText} ${rankText}`;
  });
  const best = results.reduce<WinRank>((acc, r) => (r.rank !== null && (acc === null || r.rank < acc) ? r.rank : acc), null);
  const summary = best ? `이번 주 최고 성적 ${best}등이에요.` : "이번 주는 아쉽게 지나갔어요.";
  const tail = ["", summary, "#로또 #번호대분석 #결과공개"];
  return fitToLimit(head, body, tail, THREAD_MAX_CHARS);
}
