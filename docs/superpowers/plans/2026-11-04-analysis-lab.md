# 번호 분석실 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 과거 회차 통계를 읽고 가중치로 후보를 추리고 조합을 만드는 분석 도구를 앱 안에 대시보드 화면 하나로 넣는다.

**Architecture:** 기존 백테스트 엔진(`src/features/backtest/`)의 순수 함수(점수·후보·필터)를 그대로 재사용하고, 엔진에 없던 집계(동반 출현·출현 간격·조합 특성 분포)와 조합 추출기를 `src/features/analysis/`에 새로 둔다. 화면은 `app/(tabs)/more/lab.tsx` 하나에 칩으로 칸을 바꾸는 구조. 회차 데이터는 AsyncStorage에 저장해 증분 수신한다.

**Tech Stack:** TypeScript, React Native (Expo, expo-router), zustand + AsyncStorage persist, react-native-svg, jest(jest-expo)

**Spec:** `docs/superpowers/specs/2026-11-04-analysis-lab-design.md`

## Global Constraints

- **네이티브 의존성을 추가하지 않는다.** 새 패키지 설치 금지. 슬라이더가 필요해도 `@react-native-community/slider`·`react-native-gesture-handler`·`reanimated`를 넣지 않는다 — 가중치 조절은 `Pressable` 칩 0~5단계로 한다. 이 기능은 OTA로만 나가야 하고 `runtimeVersion`을 건드리지 않는다.
- **판정·비교 문구를 넣지 않는다.** "이 방법이 낫다/아니다", "무작위보다", "확률이 오르지 않는다" 류의 문구를 쓰지 않는다. 기존 화면들이 쓰는 한 줄짜리 고지문 `통계 참고용이며 당첨 확률을 높여주지 않습니다.`만 화면 맨 아래에 둔다.
- **백테스트 UI를 만들지 않는다.** 순위표·성적 비교·유의성 검정·학습/검증 구간을 화면에 올리지 않는다. `src/features/backtest/`의 기존 파일은 Task 3에서 함수 하나를 export하는 것 외에 수정하지 않는다.
- **색·여백은 `src/constants/theme.ts`의 `colors`/`spacing`/`radius`/`cardShadow`만 쓴다.** 화면에 색 코드를 직접 적지 않는다.
- **글자 크기·여백은 `src/utils/responsive.ts`의 `useResponsive`/`getResponsiveFontSize`/`getResponsiveSpacing`을 쓴다** (기존 `more/` 화면들과 같게).
- **구간 선택(span)이 영향을 주는 값과 안 주는 값을 섞지 않는다:**
  - 선택 구간 기준: 출현 횟수, 동반 출현, 조합 특성 분포, 가중치의 `recentFrequency`·`sectorBalance`·`modBalance`
  - **항상 전체 회차 기준:** 미출현 기간, 출현 간격(평균/최단/최장), `totalFrequency`, `frequencyTypicality`
  - 화면에 "전체 기준"임을 글자로 적는다. 10회만 잘라 미출현 기간을 재면 "11회 전에 나온 번호"가 "10회 미출현"으로 보여 거짓이 된다.
- **테스트는 순수 함수만.** 이 저장소에 컴포넌트 테스트는 없다(`*.test.ts` 26개, `*.test.tsx` 0개). UI는 `npm run typecheck`와 실기기 확인으로 검증한다.
- 테스트 실행: `npx jest <경로>`. 타입체크: `npm run typecheck`.
- 저장 데이터에 `Infinity`를 쓰지 않는다 — JSON에 안 들어간다. "전체 구간"은 **숫자 0**으로 표현한다.

---

### Task 1: 회차 데이터 폰 저장

**Files:**
- Create: `src/features/backtest/drawCache.ts`
- Create: `src/features/backtest/drawCache.test.ts`
- Modify: `src/features/backtest/api/backtestDrawsApi.ts` (전체 재작성)

**Interfaces:**
- Consumes: `LottoDraw` (`src/features/backtest/types.ts`)
- Produces:
  - `mergeDraws(cached: readonly LottoDraw[], incoming: readonly LottoDraw[]): LottoDraw[]`
  - `readCachedDraws(): Promise<LottoDraw[] | null>`
  - `writeCachedDraws(draws: readonly LottoDraw[]): Promise<void>`
  - `getDrawsForBacktest(): Promise<LottoDraw[]>` (기존 이름·시그니처 유지)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/backtest/drawCache.test.ts`:

```ts
import { mergeDraws } from "./drawCache";
import type { LottoDraw } from "./types";

const draw = (round: number, first = 1): LottoDraw => ({
  round,
  numbers: [first, 11, 22, 28, 34, 45],
  bonus: 7,
});

describe("mergeDraws", () => {
  it("저장분이 없으면 받은 것을 회차순으로 돌려준다", () => {
    expect(mergeDraws([], [draw(3), draw(1), draw(2)]).map((d) => d.round)).toEqual([1, 2, 3]);
  });

  it("저장분 뒤에 새 회차를 이어붙인다", () => {
    expect(mergeDraws([draw(1), draw(2)], [draw(3)]).map((d) => d.round)).toEqual([1, 2, 3]);
  });

  it("같은 회차는 새로 받은 쪽으로 덮는다 - 1등 금액이 나중에 채워지는 회차가 있다", () => {
    const merged = mergeDraws([draw(1, 1)], [draw(1, 9)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].numbers[0]).toBe(9);
  });

  it("빈 수신분은 저장분을 그대로 둔다", () => {
    expect(mergeDraws([draw(1), draw(2)], []).map((d) => d.round)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx jest src/features/backtest/drawCache.test.ts`
Expected: FAIL — `Cannot find module './drawCache'`

- [ ] **Step 3: `drawCache.ts` 작성**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LottoDraw } from "./types";

// 회차 데이터는 한 번 받으면 바뀌지 않는다(1등 금액만 나중에 채워진다). 그래서 앱을 켤 때마다
// 전체를 다시 받을 이유가 없다 - 저장해두고 새 회차만 받아 이어붙인다. 비행기 모드에서도
// 분석이 돌고, 유저가 앱을 켤 때마다 240KB를 기다리지 않는다.
const KEY = "lotto-draws-cache-v1";

interface Cached {
  savedAt: string;
  draws: LottoDraw[];
}

/** 회차순(오름차순)으로 합친다. 같은 회차는 새로 받은 쪽이 이긴다. */
export function mergeDraws(cached: readonly LottoDraw[], incoming: readonly LottoDraw[]): LottoDraw[] {
  const byRound = new Map<number, LottoDraw>();
  for (const d of cached) byRound.set(d.round, d);
  for (const d of incoming) byRound.set(d.round, d);
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

/** 저장분. 없거나 읽다 깨지면 null - 그때는 전체를 다시 받으면 되므로 던지지 않는다. */
export async function readCachedDraws(): Promise<LottoDraw[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    return Array.isArray(parsed.draws) && parsed.draws.length > 0 ? parsed.draws : null;
  } catch {
    return null;
  }
}

/** 저장에 실패해도 화면은 멀쩡해야 한다 - 받아온 데이터는 이미 메모리에 있다. */
export async function writeCachedDraws(draws: readonly LottoDraw[]): Promise<void> {
  try {
    const payload: Cached = { savedAt: new Date().toISOString(), draws: [...draws] };
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("[drawCache] 저장 실패:", e);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest src/features/backtest/drawCache.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: `backtestDrawsApi.ts`를 캐시 경유로 바꾸기**

파일 전체를 아래로 바꾼다. `getDrawsForBacktest`의 이름과 반환형은 그대로라 부르는 쪽 세 군데(`app/replay.tsx`, `app/(tabs)/more/generator.tsx`, 새 분석실)를 고칠 필요가 없다.

```ts
import { supabase } from "@/lib/supabase";
import { mergeDraws, readCachedDraws, writeCachedDraws } from "@/features/backtest/drawCache";
import type { LottoDraw } from "@/features/backtest/types";

// 분석은 회차 전부가 필요하다. PostgREST는 한 번에 1,000행까지만 주므로(조용히 잘린다)
// range로 끊어 받는다. 잘린 걸 모르고 쓰면 "최근 1,000회만 분석했는데 전체라고 표시"가 된다.
const PAGE = 1000;

interface Row {
  draw_no: number;
  draw_date: string;
  winning_numbers: number[];
  bonus_number: number;
  // 1등 금액은 982회 중 18회만 채워져 있다. 리플레이에서 1등이 걸릴 일은 사실상 없어
  // (982회 돌려도 기대 0.00012회) 비어 있어도 화면에 영향이 없다.
  first_prize_amount_per_win: number | null;
  second_prize_amount_per_win: number | null;
  third_prize_amount_per_win: number | null;
}

function toDraw(r: Row): LottoDraw {
  return {
    round: r.draw_no,
    drawDate: r.draw_date,
    numbers: r.winning_numbers,
    bonus: r.bonus_number,
    prizePerWin: {
      ...(r.first_prize_amount_per_win ? { 1: r.first_prize_amount_per_win } : {}),
      ...(r.second_prize_amount_per_win ? { 2: r.second_prize_amount_per_win } : {}),
      ...(r.third_prize_amount_per_win ? { 3: r.third_prize_amount_per_win } : {}),
    },
  };
}

/** afterRound보다 큰 회차만 페이징으로 받는다. afterRound가 0이면 전체. */
async function fetchDrawsAfter(afterRound: number): Promise<LottoDraw[]> {
  const out: LottoDraw[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("draw_history")
      .select(
        "draw_no, draw_date, winning_numbers, bonus_number, " +
          "first_prize_amount_per_win, second_prize_amount_per_win, third_prize_amount_per_win",
      )
      .gt("draw_no", afterRound)
      .order("draw_no", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<Row[]>();
    if (error) throw error;

    const page = data ?? [];
    out.push(...page.map(toDraw));
    if (page.length < PAGE) break;
  }

  return out;
}

/**
 * 오름차순 회차 전체. 폰에 저장된 것을 먼저 읽고 새 회차만 받아 이어붙인다.
 *
 * 네트워크가 안 되면 저장분을 그대로 돌려준다 - 회차 데이터는 지난 것이 바뀌지 않으므로
 * 오프라인에서도 분석 결과가 정확하다(최신 회차 하나가 빠질 뿐이다).
 */
export async function getDrawsForBacktest(): Promise<LottoDraw[]> {
  const cached = await readCachedDraws();
  const lastRound = cached?.length ? cached[cached.length - 1].round : 0;

  let fresh: LottoDraw[];
  try {
    fresh = await fetchDrawsAfter(lastRound);
  } catch (e) {
    if (cached?.length) {
      console.warn("[draws] 수신 실패 - 저장분으로 진행:", e);
      return cached;
    }
    throw e;
  }

  if (fresh.length === 0 && cached?.length) return cached;

  const merged = mergeDraws(cached ?? [], fresh);
  await writeCachedDraws(merged);
  return merged;
}
```

- [ ] **Step 6: 타입체크와 전체 테스트**

Run: `npm run typecheck && npx jest src/features/backtest`
Expected: 에러 없음, 기존 백테스트 테스트 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/features/backtest/drawCache.ts src/features/backtest/drawCache.test.ts src/features/backtest/api/backtestDrawsApi.ts
git commit -m "Keep the draw history on the phone, and ask only for rounds it doesn't have"
```

---

### Task 2: 과거 회차 집계 (동반 출현 · 출현 간격 · 조합 특성)

**Files:**
- Create: `src/features/analysis/historyStats.ts`
- Create: `src/features/analysis/historyStats.test.ts`

**Interfaces:**
- Consumes: `LottoDraw`, `LottoRule`, `KOREA_LOTTO_6_45` (`src/features/backtest/types.ts`)
- Produces:
  - `BAND_SIZE: 10`, `BAND_COUNT: 5`, `bandIndexOf(n: number): number`, `bandLabel(i: number): string`
  - `pairCounts(draws: readonly LottoDraw[], rule: LottoRule): number[][]`
  - `topPartners(pairs: number[][], n: number, limit: number): { number: number; count: number }[]`
  - `NumberGapStats`, `gapStats(draws: readonly LottoDraw[], rule: LottoRule): NumberGapStats[]`
  - `DrawShape`, `shapeOf(draw: LottoDraw, rule: LottoRule, previous?: LottoDraw): DrawShape`
  - `ShapeDistribution`, `shapeDistribution(draws: readonly LottoDraw[], rule: LottoRule): ShapeDistribution`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/analysis/historyStats.test.ts`. 답을 손으로 아는 회차만 쓴다 — 내가 쓴 코드의 출력을 근거로 삼기 전에 검산한다.

```ts
import { KOREA_LOTTO_6_45, type LottoDraw } from "@/features/backtest/types";
import {
  bandIndexOf,
  gapStats,
  pairCounts,
  shapeDistribution,
  shapeOf,
  topPartners,
} from "./historyStats";

const RULE = KOREA_LOTTO_6_45;

// 손으로 답을 셀 수 있는 4회차.
const DRAWS: LottoDraw[] = [
  { round: 1, numbers: [1, 2, 3, 10, 20, 30], bonus: 40 },
  { round: 2, numbers: [1, 2, 11, 21, 31, 41], bonus: 5 },
  { round: 3, numbers: [3, 13, 23, 33, 43, 44], bonus: 6 },
  { round: 4, numbers: [1, 2, 3, 4, 5, 45], bonus: 7 },
];

describe("번호대(10단위)", () => {
  it("1~10은 0번, 41~45는 4번 구간이다", () => {
    expect(bandIndexOf(1)).toBe(0);
    expect(bandIndexOf(10)).toBe(0);
    expect(bandIndexOf(11)).toBe(1);
    expect(bandIndexOf(40)).toBe(3);
    expect(bandIndexOf(45)).toBe(4);
  });
});

describe("동반 출현", () => {
  const pairs = pairCounts(DRAWS, RULE);

  it("1번과 2번은 1·2·4회차에 함께 나와 3번이다", () => {
    expect(pairs[1][2]).toBe(3);
    expect(pairs[2][1]).toBe(3);
  });

  it("1번과 3번은 1·4회차에 함께 나와 2번이다", () => {
    expect(pairs[1][3]).toBe(2);
  });

  it("함께 나온 적 없으면 0이다", () => {
    expect(pairs[1][13]).toBe(0);
  });

  it("자기 자신과의 칸은 0으로 둔다", () => {
    expect(pairs[1][1]).toBe(0);
  });

  it("상위 동반 번호는 횟수 내림차순, 동률은 번호 오름차순이다", () => {
    expect(topPartners(pairs, 1, 3)).toEqual([
      { number: 2, count: 3 },
      { number: 3, count: 2 },
      { number: 4, count: 1 },
    ]);
  });
});

describe("출현 간격", () => {
  const stats = gapStats(DRAWS, RULE);
  const of = (n: number) => stats.find((s) => s.number === n)!;

  it("1번은 1·2·4회차 출현 - 간격 1과 2, 평균 1.5", () => {
    expect(of(1).appearances).toBe(3);
    expect(of(1).minGap).toBe(1);
    expect(of(1).maxGap).toBe(2);
    expect(of(1).meanGap).toBeCloseTo(1.5, 5);
  });

  it("마지막 출현 회차와 그 뒤 지난 회차 수를 센다", () => {
    expect(of(1).lastRound).toBe(4);
    expect(of(1).roundsSince).toBe(0);
    expect(of(30).lastRound).toBe(1);
    expect(of(30).roundsSince).toBe(3);
  });

  it("한 번만 나온 번호는 간격이 없다", () => {
    expect(of(30).appearances).toBe(1);
    expect(of(30).meanGap).toBeNull();
  });

  it("한 번도 안 나온 번호는 전부 비어 있다", () => {
    expect(of(39).appearances).toBe(0);
    expect(of(39).lastRound).toBeNull();
    expect(of(39).roundsSince).toBeNull();
  });

  it("보너스 번호는 출현으로 세지 않는다 - 당첨번호 6개만 본다", () => {
    expect(of(40).appearances).toBe(0);
  });
});

describe("회차 하나의 조합 특성", () => {
  it("합계·홀짝·고저를 센다", () => {
    const s = shapeOf(DRAWS[0], RULE);
    expect(s.sum).toBe(66); // 1+2+3+10+20+30
    expect(s.odd).toBe(2); // 1, 3
    expect(s.low).toBe(5); // 1,2,3,10,20 (1~22)
  });

  it("가장 긴 연속 길이를 센다", () => {
    expect(shapeOf(DRAWS[0], RULE).maxConsecutive).toBe(3); // 1,2,3
    expect(shapeOf(DRAWS[2], RULE).maxConsecutive).toBe(2); // 43,44
    expect(shapeOf(DRAWS[3], RULE).maxConsecutive).toBe(5); // 1,2,3,4,5
  });

  it("같은 끝수가 가장 많이 겹친 개수를 센다", () => {
    expect(shapeOf(DRAWS[1], RULE).maxSameEnding).toBe(4); // 1,11,21,31,41 중 41까지 → 끝수 1이 5개
  });

  it("번호대 분포를 센다", () => {
    expect(shapeOf(DRAWS[0], RULE).bands).toEqual([4, 0, 1, 0, 0]); // 1,2,3,10 / - / 20,30→ 20은 11~20
  });

  it("직전 회차와 겹친 개수(이월수)를 센다", () => {
    expect(shapeOf(DRAWS[1], RULE, DRAWS[0]).carryOver).toBe(2); // 1, 2
    expect(shapeOf(DRAWS[0], RULE).carryOver).toBeNull();
  });
});

describe("구간 전체의 특성 분포", () => {
  const dist = shapeDistribution(DRAWS, RULE);

  it("센 회차 수를 돌려준다", () => {
    expect(dist.count).toBe(4);
  });

  it("합계 평균·최소·최대", () => {
    // 66, 107, 159, 60
    expect(dist.sumMin).toBe(60);
    expect(dist.sumMax).toBe(159);
    expect(dist.sumMean).toBeCloseTo(98, 5);
  });

  it("홀수 개수별 회차 수 (길이는 pickCount+1)", () => {
    // 1회차 홀2, 2회차 홀4(1,11,21,31,41중 1,11,21,31,41→ 실제 [1,2,11,21,31,41] 홀=1,11,21,31,41=5)
    expect(dist.oddCounts).toHaveLength(RULE.pickCount + 1);
    expect(dist.oddCounts.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("번호대별 출현 합계는 전체 번호 개수와 같다", () => {
    expect(dist.bandTotals.reduce((a, b) => a + b, 0)).toBe(4 * RULE.pickCount);
  });

  it("이월수는 첫 회차를 빼고 센다", () => {
    expect(dist.carryOverCounts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("합계 히스토그램 칸의 합은 회차 수와 같다", () => {
    expect(dist.sumHistogram.reduce((s, b) => s + b.count, 0)).toBe(4);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx jest src/features/analysis/historyStats.test.ts`
Expected: FAIL — `Cannot find module './historyStats'`

- [ ] **Step 3: `historyStats.ts` 작성**

```ts
// 과거 회차를 "읽기" 위한 집계. 백테스트 엔진(recipes.ts)이 점수 계산에 쓰는 통계와 달리
// 이 파일은 화면에 그대로 뿌릴 숫자를 만든다 - 번호를 고르지 않고, 판정하지 않는다.
//
// React를 import하지 않는다. 같은 코드가 화면·스크립트 어디서든 같은 숫자를 내야 한다.
import type { LottoDraw, LottoRule } from "@/features/backtest/types";

// ---------- 번호대(10단위) ----------
//
// 엔진의 6등분(sectorRanges)과 별개다. 사람들이 실제로 "1번대 2번대"로 나눠 보는 기준이
// 10단위라 화면에는 이걸 쓴다. 6등분은 가중치 계산에 그대로 남는다.
export const BAND_SIZE = 10;
export const BAND_COUNT = 5;

/** 번호가 속한 10단위 구간(0부터). 41~45는 마지막 구간에 함께 넣는다. */
export function bandIndexOf(n: number): number {
  return Math.min(Math.floor((n - 1) / BAND_SIZE), BAND_COUNT - 1);
}

export function bandLabel(i: number): string {
  const from = i * BAND_SIZE + 1;
  const to = i === BAND_COUNT - 1 ? 45 : (i + 1) * BAND_SIZE;
  return `${from}~${to}`;
}

// ---------- 동반 출현 ----------

/**
 * 번호 쌍이 함께 나온 횟수. [a][b]와 [b][a]가 같은 값이고 [n][n]은 0이다.
 * 1,243회차 × 15쌍 = 18,645번 더하기라 즉시 끝난다.
 */
export function pairCounts(draws: readonly LottoDraw[], rule: LottoRule): number[][] {
  const size = rule.maxNumber + 1;
  const counts = Array.from({ length: size }, () => new Array<number>(size).fill(0));

  for (const draw of draws) {
    const nums = draw.numbers;
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const a = nums[i];
        const b = nums[j];
        if (a < 1 || b < 1 || a > rule.maxNumber || b > rule.maxNumber || a === b) continue;
        counts[a][b] += 1;
        counts[b][a] += 1;
      }
    }
  }

  return counts;
}

/** n번과 함께 많이 나온 번호 상위 limit개. 동률은 번호가 작은 쪽을 먼저. */
export function topPartners(
  pairs: number[][],
  n: number,
  limit: number,
): { number: number; count: number }[] {
  const row = pairs[n] ?? [];
  return row
    .map((count, number) => ({ number, count }))
    .filter((p) => p.number >= 1 && p.number !== n && p.count > 0)
    .sort((a, b) => b.count - a.count || a.number - b.number)
    .slice(0, limit);
}

// ---------- 출현 간격 ----------

export interface NumberGapStats {
  number: number;
  /** 당첨번호 6개로 나온 횟수. 보너스는 세지 않는다. */
  appearances: number;
  /** 마지막으로 나온 회차. 한 번도 안 나왔으면 null. */
  lastRound: number | null;
  /** 마지막 출현 이후 지난 회차 수. 마지막 회차에 나왔으면 0. */
  roundsSince: number | null;
  /** 출현 간격(회차 수)의 평균/최소/최대. 두 번 이상 나오지 않았으면 null. */
  meanGap: number | null;
  minGap: number | null;
  maxGap: number | null;
}

/**
 * 번호별 출현 간격. 간격은 **회차 번호의 차이**가 아니라 데이터상 몇 회차 뒤에 다시 나왔는지다
 * (빠진 회차가 있어도 "몇 번째 추첨 뒤"라는 뜻이 유지된다).
 */
export function gapStats(draws: readonly LottoDraw[], rule: LottoRule): NumberGapStats[] {
  const sorted = [...draws].sort((a, b) => a.round - b.round);
  const positions = new Map<number, number[]>();

  sorted.forEach((draw, index) => {
    for (const n of draw.numbers) {
      if (n < 1 || n > rule.maxNumber) continue;
      const list = positions.get(n);
      if (list) list.push(index);
      else positions.set(n, [index]);
    }
  });

  const lastIndex = sorted.length - 1;

  return Array.from({ length: rule.maxNumber }, (_, i) => {
    const number = i + 1;
    const at = positions.get(number) ?? [];
    if (at.length === 0) {
      return { number, appearances: 0, lastRound: null, roundsSince: null, meanGap: null, minGap: null, maxGap: null };
    }

    const gaps: number[] = [];
    for (let k = 1; k < at.length; k++) gaps.push(at[k] - at[k - 1]);
    const last = at[at.length - 1];

    return {
      number,
      appearances: at.length,
      lastRound: sorted[last].round,
      roundsSince: lastIndex - last,
      meanGap: gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null,
      minGap: gaps.length ? Math.min(...gaps) : null,
      maxGap: gaps.length ? Math.max(...gaps) : null,
    };
  });
}

// ---------- 조합 특성 ----------

export interface DrawShape {
  sum: number;
  /** 홀수 개수. 짝수 개수는 pickCount - odd. */
  odd: number;
  /** 저번호(1 ~ maxNumber/2) 개수. */
  low: number;
  /** 10단위 구간별 개수. 길이 BAND_COUNT. */
  bands: number[];
  /** 가장 긴 연속 번호의 길이. 1이면 연속이 없다(엔진 filters.maxConsecutive와 같은 뜻). */
  maxConsecutive: number;
  /** 같은 끝수가 가장 많이 겹친 개수. 1이면 겹침이 없다. */
  maxSameEnding: number;
  /** 직전 회차와 겹친 개수. 직전 회차를 안 주면 null. */
  carryOver: number | null;
}

export function shapeOf(draw: LottoDraw, rule: LottoRule, previous?: LottoDraw): DrawShape {
  const sorted = [...draw.numbers].sort((a, b) => a - b);
  const half = rule.maxNumber / 2;

  const bands = new Array<number>(BAND_COUNT).fill(0);
  for (const n of sorted) bands[bandIndexOf(n)] += 1;

  let run = 1;
  let maxConsecutive = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] - sorted[i - 1] === 1 ? run + 1 : 1;
    if (run > maxConsecutive) maxConsecutive = run;
  }

  const endings = new Array<number>(10).fill(0);
  for (const n of sorted) endings[n % 10] += 1;

  const prevSet = previous ? new Set(previous.numbers) : null;

  return {
    sum: sorted.reduce((s, n) => s + n, 0),
    odd: sorted.filter((n) => n % 2 === 1).length,
    low: sorted.filter((n) => n <= half).length,
    bands,
    maxConsecutive,
    maxSameEnding: Math.max(...endings),
    carryOver: prevSet ? sorted.filter((n) => prevSet.has(n)).length : null,
  };
}

export interface SumBucket {
  from: number;
  to: number;
  count: number;
}

export interface ShapeDistribution {
  count: number;
  sumMean: number;
  sumMin: number;
  sumMax: number;
  /** 10 단위 칸. 6/45의 가능한 합계는 21~255다. */
  sumHistogram: SumBucket[];
  /** 홀수 개수별 회차 수. 길이 pickCount+1. */
  oddCounts: number[];
  /** 저번호 개수별 회차 수. 길이 pickCount+1. */
  lowCounts: number[];
  /** 10단위 구간별 번호 출현 합계. 길이 BAND_COUNT. */
  bandTotals: number[];
  /** 가장 긴 연속 길이별 회차 수. 길이 pickCount+1 (index 0은 안 쓴다). */
  consecutiveCounts: number[];
  /** 같은 끝수 최대 겹침별 회차 수. 길이 pickCount+1 (index 0은 안 쓴다). */
  sameEndingCounts: number[];
  /** 이월수별 회차 수. 첫 회차는 직전이 없어 세지 않는다. 길이 pickCount+1. */
  carryOverCounts: number[];
}

const SUM_BUCKET = 10;

export function shapeDistribution(draws: readonly LottoDraw[], rule: LottoRule): ShapeDistribution {
  const sorted = [...draws].sort((a, b) => a.round - b.round);
  const shapes = sorted.map((d, i) => shapeOf(d, rule, i > 0 ? sorted[i - 1] : undefined));

  const oddCounts = new Array<number>(rule.pickCount + 1).fill(0);
  const lowCounts = new Array<number>(rule.pickCount + 1).fill(0);
  const consecutiveCounts = new Array<number>(rule.pickCount + 1).fill(0);
  const sameEndingCounts = new Array<number>(rule.pickCount + 1).fill(0);
  const carryOverCounts = new Array<number>(rule.pickCount + 1).fill(0);
  const bandTotals = new Array<number>(BAND_COUNT).fill(0);

  const minPossible = (rule.pickCount * (rule.pickCount + 1)) / 2;
  const maxPossible =
    (rule.pickCount * (2 * rule.maxNumber - rule.pickCount + 1)) / 2;
  const first = Math.floor(minPossible / SUM_BUCKET) * SUM_BUCKET;
  const buckets: SumBucket[] = [];
  for (let from = first; from <= maxPossible; from += SUM_BUCKET) {
    buckets.push({ from, to: from + SUM_BUCKET - 1, count: 0 });
  }

  let sumTotal = 0;
  let sumMin = Number.POSITIVE_INFINITY;
  let sumMax = Number.NEGATIVE_INFINITY;

  for (const s of shapes) {
    sumTotal += s.sum;
    if (s.sum < sumMin) sumMin = s.sum;
    if (s.sum > sumMax) sumMax = s.sum;
    oddCounts[s.odd] += 1;
    lowCounts[s.low] += 1;
    consecutiveCounts[Math.min(s.maxConsecutive, rule.pickCount)] += 1;
    sameEndingCounts[Math.min(s.maxSameEnding, rule.pickCount)] += 1;
    if (s.carryOver !== null) carryOverCounts[s.carryOver] += 1;
    s.bands.forEach((c, i) => (bandTotals[i] += c));
    const bucket = buckets[Math.floor((s.sum - first) / SUM_BUCKET)];
    if (bucket) bucket.count += 1;
  }

  return {
    count: shapes.length,
    sumMean: shapes.length ? sumTotal / shapes.length : 0,
    sumMin: shapes.length ? sumMin : 0,
    sumMax: shapes.length ? sumMax : 0,
    sumHistogram: buckets,
    oddCounts,
    lowCounts,
    bandTotals,
    consecutiveCounts,
    sameEndingCounts,
    carryOverCounts,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인 — 실패하면 테스트의 손계산을 먼저 의심한다**

Run: `npx jest src/features/analysis/historyStats.test.ts`
Expected: PASS

주의: 테스트에 적은 기대값(`bands`, `maxSameEnding` 등)이 손계산이다. 틀리면 **구현을 테스트에 맞추기 전에 손으로 다시 세어본다.** 예: 2회차 `[1,2,11,21,31,41]`의 끝수는 1이 다섯 개(1·11·21·31·41)와 2가 하나 → `maxSameEnding`은 5다. 테스트에 4로 적혀 있으면 테스트가 틀린 것이니 5로 고친다. 1회차 `[1,2,3,10,20,30]`의 번호대는 1·2·3·10이 0번 구간, 20이 1번 구간, 30이 2번 구간 → `[4,1,1,0,0]`이다. 테스트의 `[4,0,1,0,0]`은 틀렸으니 고친다.

- [ ] **Step 5: 커밋**

```bash
git add src/features/analysis/historyStats.ts src/features/analysis/historyStats.test.ts
git commit -m "Count what analysts actually read: which numbers travel together, how long they wait, what shapes draws take"
```

---

### Task 3: 조합 추출기 (통과 조합 수 + 뽑기)

**Files:**
- Create: `src/features/analysis/comboPicker.ts`
- Create: `src/features/analysis/comboPicker.test.ts`

**Interfaces:**
- Consumes: `passesFilters` (`src/features/backtest/recipes.ts`), `combinations` (`src/features/backtest/pascal.ts`), `seededRng` (`src/features/backtest/engine.ts`), `FilterConfig`·`LottoDraw`·`LottoRule`·`Rng` (`types.ts`)
- Produces:
  - `ComboPick { total: number; passing: number; games: number[][] }`
  - `pickCombos(opts: { candidates: readonly number[]; pinned?: readonly number[]; rule: LottoRule; filters: FilterConfig; count: number; rng: Rng; previousDraw?: LottoDraw }): ComboPick`

왜 새로 만드나: 엔진의 `recipeStrategy()`는 후보를 **자기가 다시 계산**하므로 유저가 손으로 고정/제외한 후보를 쓸 수 없다. 그리고 엔진의 내부 `fillTickets`는 개수를 맞추려고 **마지막에 필터를 포기**한다 — 백테스트에서는 티켓 수가 전제라 맞지만, 유저가 직접 건 조건을 몰래 버리는 건 도구로서 틀렸다. 여기서는 후보 안의 조합을 한 번 훑어 통과분을 세면서 동시에 뽑는다(후보 20개면 C(20,6)=38,760개, 즉시).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/analysis/comboPicker.test.ts`:

```ts
import { seededRng } from "@/features/backtest/engine";
import { KOREA_LOTTO_6_45 } from "@/features/backtest/types";
import { pickCombos } from "./comboPicker";

const RULE = KOREA_LOTTO_6_45;
const rng = () => seededRng("test");

describe("pickCombos", () => {
  it("필터가 없으면 후보의 모든 조합이 통과다", () => {
    const r = pickCombos({ candidates: [1, 2, 3, 4, 5, 6, 7], rule: RULE, filters: {}, count: 3, rng: rng() });
    expect(r.total).toBe(7); // C(7,6)
    expect(r.passing).toBe(7);
    expect(r.games).toHaveLength(3);
  });

  it("후보가 6개 미만이면 아무것도 못 만든다", () => {
    const r = pickCombos({ candidates: [1, 2, 3], rule: RULE, filters: {}, count: 5, rng: rng() });
    expect(r.total).toBe(0);
    expect(r.games).toEqual([]);
  });

  it("뽑은 조합은 전부 필터를 통과한다 - 개수를 맞추려고 조건을 버리지 않는다", () => {
    const r = pickCombos({
      candidates: Array.from({ length: 15 }, (_, i) => i + 1),
      rule: RULE,
      filters: { sumRange: [30, 40] },
      count: 50,
      rng: rng(),
    });
    for (const g of r.games) {
      const sum = g.reduce((s, n) => s + n, 0);
      expect(sum).toBeGreaterThanOrEqual(30);
      expect(sum).toBeLessThanOrEqual(40);
    }
    // 통과분보다 많이 달라고 해도 통과분까지만 준다
    expect(r.games.length).toBe(Math.min(50, r.passing));
  });

  it("고정 번호는 모든 조합에 들어간다", () => {
    const r = pickCombos({
      candidates: Array.from({ length: 12 }, (_, i) => i + 1),
      pinned: [7, 11],
      rule: RULE,
      filters: {},
      count: 5,
      rng: rng(),
    });
    expect(r.total).toBe(120); // C(10,4)
    for (const g of r.games) {
      expect(g).toContain(7);
      expect(g).toContain(11);
    }
  });

  it("고정 번호가 6개면 그 조합 하나뿐이다", () => {
    const r = pickCombos({
      candidates: [1, 2, 3, 4, 5, 6, 7, 8],
      pinned: [1, 2, 3, 4, 5, 6],
      rule: RULE,
      filters: {},
      count: 5,
      rng: rng(),
    });
    expect(r.total).toBe(1);
    expect(r.games).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("고정 번호가 7개면 만들 수 없다", () => {
    const r = pickCombos({
      candidates: [1, 2, 3, 4, 5, 6, 7],
      pinned: [1, 2, 3, 4, 5, 6, 7],
      rule: RULE,
      filters: {},
      count: 5,
      rng: rng(),
    });
    expect(r.total).toBe(0);
    expect(r.games).toEqual([]);
  });

  it("같은 시드면 같은 조합이 나온다", () => {
    const opts = {
      candidates: Array.from({ length: 15 }, (_, i) => i + 1),
      rule: RULE,
      filters: {},
      count: 5,
    };
    expect(pickCombos({ ...opts, rng: rng() }).games).toEqual(pickCombos({ ...opts, rng: rng() }).games);
  });

  it("뽑은 조합은 서로 다르고 번호는 오름차순이다", () => {
    const r = pickCombos({
      candidates: Array.from({ length: 20 }, (_, i) => i + 1),
      rule: RULE,
      filters: {},
      count: 10,
      rng: rng(),
    });
    const keys = r.games.map((g) => g.join(","));
    expect(new Set(keys).size).toBe(10);
    for (const g of r.games) expect([...g].sort((a, b) => a - b)).toEqual(g);
  });

  it("이월수 필터는 직전 회차를 받아 적용한다", () => {
    const previousDraw = { round: 100, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 };
    const r = pickCombos({
      candidates: Array.from({ length: 12 }, (_, i) => i + 1),
      rule: RULE,
      filters: { previousDrawOverlap: [0, 0] },
      count: 5,
      rng: rng(),
      previousDraw,
    });
    for (const g of r.games) expect(g.some((n) => n <= 6)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx jest src/features/analysis/comboPicker.test.ts`
Expected: FAIL — `Cannot find module './comboPicker'`

- [ ] **Step 3: `comboPicker.ts` 작성**

```ts
// 후보에서 조합을 뽑는다. 후보 안의 모든 조합을 한 번 훑으면서 통과분을 세고, 동시에
// 저수지 표본추출(reservoir sampling)로 필요한 개수만 들고 있는다 - 3만 개 조합을 전부
// 배열에 담지 않으므로 폰 메모리에 부담이 없다.
//
// 개수를 맞추려고 필터를 버리지 않는다. 유저가 직접 건 조건이라, 조건에 맞는 조합이 3개뿐이면
// 3개를 준다("조건이 좁아 3개만 나왔다"를 화면이 말할 수 있어야 한다).
import { passesFilters } from "@/features/backtest/recipes";
import { combinations } from "@/features/backtest/pascal";
import type { FilterConfig, LottoDraw, LottoRule, Rng } from "@/features/backtest/types";

export interface ComboPick {
  /** 후보(고정 번호 포함)로 만들 수 있는 조합 수. */
  total: number;
  /** 그중 필터를 통과한 조합 수. */
  passing: number;
  /** 통과분에서 고르게 뽑은 조합. 요청한 수보다 통과분이 적으면 그만큼만. */
  games: number[][];
}

export interface PickCombosOptions {
  candidates: readonly number[];
  /** 반드시 포함할 번호. candidates에 없어도 포함한다. */
  pinned?: readonly number[];
  rule: LottoRule;
  filters: FilterConfig;
  count: number;
  rng: Rng;
  previousDraw?: LottoDraw;
}

export function pickCombos(options: PickCombosOptions): ComboPick {
  const { candidates, rule, filters, count, rng, previousDraw } = options;
  const pinned = [...new Set(options.pinned ?? [])].sort((a, b) => a - b);
  const k = rule.pickCount;

  if (pinned.length > k) return { total: 0, passing: 0, games: [] };

  // 고정 번호를 뺀 나머지에서 (k - 고정) 개를 고른다.
  const pool = [...new Set(candidates)].filter((n) => !pinned.includes(n)).sort((a, b) => a - b);
  const need = k - pinned.length;

  if (pool.length < need) return { total: 0, passing: 0, games: [] };

  const total = combinations(pool.length, need);
  let passing = 0;
  const reservoir: number[][] = [];

  const indices = Array.from({ length: need }, (_, i) => i);

  for (;;) {
    const combo = [...pinned, ...indices.map((i) => pool[i])].sort((a, b) => a - b);
    if (passesFilters(combo, rule, filters, previousDraw)) {
      passing += 1;
      if (reservoir.length < count) {
        reservoir.push(combo);
      } else {
        // 통과한 j번째 조합을 1/j 확률로 넣는다 - 전체를 담지 않고도 고르게 뽑힌다.
        const j = Math.floor(rng() * passing);
        if (j < count) reservoir[j] = combo;
      }
    }

    if (need === 0) break;
    let pos = need - 1;
    while (pos >= 0 && indices[pos] === pool.length - need + pos) pos -= 1;
    if (pos < 0) break;
    indices[pos] += 1;
    for (let i = pos + 1; i < need; i++) indices[i] = indices[i - 1] + 1;
  }

  return { total, passing, games: reservoir };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest src/features/analysis/comboPicker.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/features/analysis/comboPicker.ts src/features/analysis/comboPicker.test.ts
git commit -m "Draw combinations from the candidates the user settled on, without quietly dropping their filters"
```

---

### Task 4: 내 설정 저장

**Files:**
- Create: `src/features/analysis/analysisSetup.ts`
- Create: `src/features/analysis/analysisSetup.test.ts`
- Create: `src/features/analysis/useAnalysisSetups.ts`

**Interfaces:**
- Consumes: `RecipeWeights`·`FilterConfig`·`ZERO_WEIGHTS` (`src/features/backtest/types.ts`)
- Produces:
  - `AnalysisSetup`, `LAB_WEIGHT_KEYS`, `WEIGHT_LABELS`, `MAX_WEIGHT`, `defaultSetup(): AnalysisSetup`
  - `ALL_ROUNDS: 0`, `windowOf(draws, span)`
  - `toRecipeWeights(setup: AnalysisSetup): RecipeWeights`
  - `useAnalysisSetups` — `{ setups: AnalysisSetup[], save(setup): void, remove(id): void }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/analysis/analysisSetup.test.ts`:

```ts
import { ZERO_WEIGHTS, type LottoDraw } from "@/features/backtest/types";
import { ALL_ROUNDS, defaultSetup, LAB_WEIGHT_KEYS, toRecipeWeights, windowOf } from "./analysisSetup";

const draws: LottoDraw[] = Array.from({ length: 10 }, (_, i) => ({
  round: i + 1,
  numbers: [1, 2, 3, 4, 5, 6],
  bonus: 7,
}));

describe("기본 설정", () => {
  it("가중치는 0~5 범위 안이다", () => {
    const s = defaultSetup();
    for (const key of LAB_WEIGHT_KEYS) {
      expect(s.weights[key]).toBeGreaterThanOrEqual(0);
      expect(s.weights[key]).toBeLessThanOrEqual(5);
    }
  });

  it("피보나치·서로소는 분석실 가중치에 없다 - 이미 다른 화면에 있고 과거 데이터와 무관하다", () => {
    expect(LAB_WEIGHT_KEYS).not.toContain("fibonacciAffinity");
    expect(LAB_WEIGHT_KEYS).not.toContain("totient");
  });

  it("후보 수는 10~20 사이다", () => {
    expect(defaultSetup().candidateCount).toBeGreaterThanOrEqual(10);
    expect(defaultSetup().candidateCount).toBeLessThanOrEqual(20);
  });
});

describe("엔진 가중치로 바꾸기", () => {
  it("분석실에 없는 요소는 0으로 둔다", () => {
    const w = toRecipeWeights(defaultSetup());
    expect(w.fibonacciAffinity).toBe(0);
    expect(w.totient).toBe(0);
    expect(Object.keys(w).sort()).toEqual(Object.keys(ZERO_WEIGHTS).sort());
  });

  it("그룹을 안 쓰면 그룹 가중치를 0으로 만든다 - 그룹 통계가 전부 0이라 점수가 뒤틀린다", () => {
    const setup = { ...defaultSetup(), groupCount: undefined, weights: { ...defaultSetup().weights, groupFrequency: 3, groupGap: 2 } };
    const w = toRecipeWeights(setup);
    expect(w.groupFrequency).toBe(0);
    expect(w.groupGap).toBe(0);
  });
});

describe("구간 자르기", () => {
  it("전체(0)는 전 회차를 쓴다", () => {
    expect(windowOf(draws, ALL_ROUNDS)).toHaveLength(10);
  });

  it("최근 N회는 뒤에서 N개다", () => {
    expect(windowOf(draws, 3).map((d) => d.round)).toEqual([8, 9, 10]);
  });

  it("데이터보다 긴 구간을 달라면 있는 만큼만 준다", () => {
    expect(windowOf(draws, 50)).toHaveLength(10);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx jest src/features/analysis/analysisSetup.test.ts`
Expected: FAIL — `Cannot find module './analysisSetup'`

- [ ] **Step 3: `analysisSetup.ts` 작성**

```ts
// 분석실 한 세트의 설정과, 그걸 엔진이 먹는 모양으로 바꾸는 변환.
// 화면(lab.tsx)과 저장(useAnalysisSetups)이 같은 타입을 쓰게 여기 한 곳에 둔다.
import { ZERO_WEIGHTS, type FilterConfig, type LottoDraw, type RecipeWeights } from "@/features/backtest/types";

/** 구간 선택에서 "전체". JSON에 Infinity를 넣을 수 없어 0을 쓴다. */
export const ALL_ROUNDS = 0;

/** 구간 선택 후보. 화면 칩 순서와 같다. */
export const SPAN_OPTIONS: readonly { label: string; value: number }[] = [
  { label: "최근 10회", value: 10 },
  { label: "최근 30회", value: 30 },
  { label: "최근 50회", value: 50 },
  { label: "최근 100회", value: 100 },
  { label: "전체", value: ALL_ROUNDS },
];

/**
 * 분석실에서 조절하는 가중치. 엔진의 `RecipeWeights` 중 과거 데이터로 정해지는 것만 쓴다.
 * 피보나치 근접·서로소 비율(φ(n)/n)은 번호 자체로 정해지는 값이고 '천재들의 한수' 화면에
 * 이미 있어서 여기엔 두지 않는다.
 */
export const LAB_WEIGHT_KEYS = [
  "totalFrequency",
  "recentFrequency",
  "gap",
  "sectorBalance",
  "modBalance",
  "frequencyTypicality",
  "groupFrequency",
  "groupGap",
] as const satisfies readonly (keyof RecipeWeights)[];

export type LabWeightKey = (typeof LAB_WEIGHT_KEYS)[number];

export const WEIGHT_LABELS: Record<LabWeightKey, string> = {
  totalFrequency: "전체 출현 횟수",
  recentFrequency: "최근 출현 횟수",
  gap: "안 나온 기간",
  sectorBalance: "구간 균형",
  modBalance: "나머지그룹 균형",
  frequencyTypicality: "기대치 근접",
  groupFrequency: "같은 그룹 출현 횟수",
  groupGap: "같은 그룹 미출현",
};

/** 그룹(회차주기)을 켰을 때만 쓰는 가중치. 안 켜면 화면에 안 띄우고 0으로 넘긴다. */
export const GROUP_WEIGHT_KEYS: readonly LabWeightKey[] = ["groupFrequency", "groupGap"];

/** 가중치 칩 단계. 0은 "안 씀". */
export const MAX_WEIGHT = 5;

export interface AnalysisSetup {
  id: string;
  name: string;
  savedAt: string;
  /** 구간. ALL_ROUNDS(0)면 전체. */
  span: number;
  weights: Record<LabWeightKey, number>;
  /** 후보로 남길 개수. 10~20. */
  candidateCount: number;
  /** 한 구간(6등분)에서 후보로 쓸 최대 개수. */
  sectorCap?: number;
  /** 한 나머지그룹(n mod 5)에서 후보로 쓸 최대 개수. sectorCap과 같이 주면 sectorCap이 이긴다. */
  modGroupCap?: number;
  /** 회차주기 그룹 수. 없으면 그룹을 쓰지 않는다. */
  groupCount?: number;
  /** 점수와 무관하게 반드시 후보에 넣을 번호. */
  pinned: number[];
  /** 점수가 높아도 후보에서 뺄 번호. */
  excluded: number[];
  filters: FilterConfig;
}

export function defaultSetup(): AnalysisSetup {
  return {
    id: "current",
    name: "내 분석",
    savedAt: new Date().toISOString(),
    span: 100,
    weights: {
      totalFrequency: 3,
      recentFrequency: 2,
      gap: 1,
      sectorBalance: 1,
      modBalance: 0,
      frequencyTypicality: 0,
      groupFrequency: 0,
      groupGap: 0,
    },
    candidateCount: 15,
    pinned: [],
    excluded: [],
    filters: {},
  };
}

/**
 * 엔진 가중치로 바꾼다. 분석실에 없는 요소는 0이다.
 * 그룹을 안 쓰면 그룹 가중치도 0으로 눌러야 한다 - 그룹 통계가 전부 0인 상태로 가중치만
 * 살아 있으면 모든 번호가 같은 점수를 받아 후보 압축이 그냥 번호순이 된다.
 */
export function toRecipeWeights(setup: AnalysisSetup): RecipeWeights {
  const useGroup = setup.groupCount !== undefined;
  const out: RecipeWeights = { ...ZERO_WEIGHTS };
  for (const key of LAB_WEIGHT_KEYS) {
    const isGroupWeight = GROUP_WEIGHT_KEYS.includes(key);
    out[key] = isGroupWeight && !useGroup ? 0 : setup.weights[key];
  }
  return out;
}

/** 구간만큼 뒤에서 자른다. 회차 데이터는 오름차순이므로 최근이 뒤쪽이다. */
export function windowOf(draws: readonly LottoDraw[], span: number): readonly LottoDraw[] {
  if (span === ALL_ROUNDS || span >= draws.length) return draws;
  return draws.slice(draws.length - span);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest src/features/analysis/analysisSetup.test.ts`
Expected: PASS

- [ ] **Step 5: `useAnalysisSetups.ts` 작성 (저장)**

`src/features/favorites/useFavorites.ts`와 같은 패턴을 그대로 따른다.

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AnalysisSetup } from "./analysisSetup";

// 내가 만든 분석 설정을 폰에만 저장한다. 서버에 올리지 않고 로그인을 붙이지 않는다 -
// 앱을 지우면 사라지는 것이 의도된 동작이다(2026-11-01 결정).

interface AnalysisSetupsState {
  setups: AnalysisSetup[];
  /** 같은 id면 덮고, 없으면 앞에 넣는다. */
  save: (setup: AnalysisSetup) => void;
  remove: (id: string) => void;
}

export const useAnalysisSetups = create<AnalysisSetupsState>()(
  persist(
    (set) => ({
      setups: [],
      save: (setup) =>
        set((state) => {
          const rest = state.setups.filter((s) => s.id !== setup.id);
          return { setups: [setup, ...rest] };
        }),
      remove: (id) => set((state) => ({ setups: state.setups.filter((s) => s.id !== id) })),
    }),
    { name: "analysis-setups-v1", storage: createJSONStorage(() => AsyncStorage) },
  ),
);
```

`createJSONStorage`라는 이름은 이 저장소가 쓰는 그대로다(`src/features/favorites/useFavorites.ts:2`에서 확인됨 — zustand 공식 문서의 `createJSONStorage`와 같은 것이다).

- [ ] **Step 6: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add src/features/analysis/analysisSetup.ts src/features/analysis/analysisSetup.test.ts src/features/analysis/useAnalysisSetups.ts
git commit -m "Hold one analysis setup, and keep the saved ones on the phone"
```

---

### Task 5: 번호판 컴포넌트 (통계 칸 1/2)

**Files:**
- Create: `src/features/analysis/components/NumberHeatGrid.tsx`

**Interfaces:**
- Consumes: `NumberGapStats`·`topPartners` (Task 2), `LottoBall` (`src/components/LottoBall.tsx`, props `{ number, isBonus?, size?: "xs"|"small"|"large" }`), `colors`/`spacing`/`radius` (`src/constants/theme.ts`), `useResponsive`/`getResponsiveFontSize` (`src/utils/responsive.ts`)
- Produces:
  - `HeatMetric = "count" | "idle" | "meanGap"`
  - `NumberHeatGrid(props: { metric: HeatMetric; onMetricChange(m: HeatMetric): void; counts: number[]; gaps: NumberGapStats[]; partnersOf(n: number): { number: number; count: number }[]; spanLabel: string; maxNumber: number })`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { getResponsiveFontSize, useResponsive } from "@/utils/responsive";
import type { NumberGapStats } from "../historyStats";

export type HeatMetric = "count" | "idle" | "meanGap";

const METRICS: readonly { key: HeatMetric; label: string }[] = [
  { key: "count", label: "출현 횟수" },
  { key: "idle", label: "안 나온 기간" },
  { key: "meanGap", label: "평균 출현 간격" },
];

// 지표마다 "전체 기준"인지 "선택 구간 기준"인지 다르다. 섞으면 숫자가 거짓이 된다 -
// 최근 10회만 잘라 미출현 기간을 재면 11회 전에 나온 번호가 "10회 미출현"으로 보인다.
const METRIC_BASIS: Record<HeatMetric, "span" | "all"> = {
  count: "span",
  idle: "all",
  meanGap: "all",
};

interface Props {
  metric: HeatMetric;
  onMetricChange: (m: HeatMetric) => void;
  /** 선택 구간의 번호별 출현 횟수. counts[n]이 n번 횟수(0번 칸은 안 쓴다). */
  counts: number[];
  /** 전체 기준 간격 통계. 길이 maxNumber, 0-index가 1번. */
  gaps: NumberGapStats[];
  partnersOf: (n: number) => { number: number; count: number }[];
  spanLabel: string;
  maxNumber: number;
}

function valueOf(metric: HeatMetric, n: number, counts: number[], gaps: NumberGapStats[]): number | null {
  const g = gaps[n - 1];
  if (metric === "count") return counts[n] ?? 0;
  if (metric === "idle") return g?.roundsSince ?? null;
  return g?.meanGap ?? null;
}

export function NumberHeatGrid({ metric, onMetricChange, counts, gaps, partnersOf, spanLabel, maxNumber }: Props) {
  const { breakpoint } = useResponsive();
  const [open, setOpen] = useState<number | null>(null);

  const numbers = Array.from({ length: maxNumber }, (_, i) => i + 1);
  const values = numbers.map((n) => valueOf(metric, n, counts, gaps));
  const present = values.filter((v): v is number => v !== null);
  const max = present.length ? Math.max(...present) : 0;
  const min = present.length ? Math.min(...present) : 0;

  const detail = open === null ? null : gaps[open - 1];
  const basis = METRIC_BASIS[metric] === "span" ? spanLabel : "전체 회차";

  return (
    <View style={styles.card}>
      <View style={styles.chips}>
        {METRICS.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => onMetricChange(m.key)}
            style={[styles.chip, metric === m.key && styles.chipActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, metric === m.key && styles.chipTextActive]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.basis, { fontSize: getResponsiveFontSize(12, breakpoint) }]}>{basis} 기준</Text>

      <View style={styles.grid}>
        {numbers.map((n, i) => {
          const v = values[i];
          // 값이 큰 번호일수록 진하게. 색은 테마의 금색 하나만 쓰고 투명도로 농도를 만든다.
          const ratio = v === null || max === min ? 0 : (v - min) / (max - min);
          return (
            <Pressable
              key={n}
              onPress={() => setOpen(open === n ? null : n)}
              style={[
                styles.cell,
                { backgroundColor: `rgba(184, 135, 58, ${0.08 + ratio * 0.75})` },
                open === n && styles.cellOpen,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${n}번 ${v ?? "자료 없음"}`}
            >
              <Text style={[styles.cellNumber, ratio > 0.55 && styles.cellNumberOnDark]}>{n}</Text>
              <Text style={[styles.cellValue, ratio > 0.55 && styles.cellNumberOnDark]}>
                {v === null ? "-" : metric === "meanGap" ? v.toFixed(1) : v}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {detail && (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>{detail.number}번</Text>
          <Text style={styles.detailLine}>
            {spanLabel} 출현 {counts[detail.number] ?? 0}회 · 전체 {detail.appearances}회
          </Text>
          <Text style={styles.detailLine}>
            {detail.lastRound === null
              ? "한 번도 나오지 않았어요"
              : `마지막 출현 ${detail.lastRound}회 (${detail.roundsSince}회 전)`}
          </Text>
          <Text style={styles.detailLine}>
            {detail.meanGap === null
              ? "출현 간격 - 두 번 이상 나와야 셀 수 있어요"
              : `출현 간격 평균 ${detail.meanGap.toFixed(1)}회 / 최단 ${detail.minGap}회 / 최장 ${detail.maxGap}회`}
          </Text>
          <Text style={styles.detailLine}>
            함께 많이 나온 번호 —{" "}
            {partnersOf(detail.number)
              .map((p) => `${p.number}(${p.count}회)`)
              .join(" ") || "없음"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: colors.primaryDark, fontWeight: "700" },
  basis: { color: colors.textMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  cell: {
    width: 44,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cellOpen: { borderWidth: 2, borderColor: colors.seal },
  cellNumber: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  cellValue: { fontSize: 10, color: colors.textSecondary },
  cellNumberOnDark: { color: "#fff" },
  detail: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  detailTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  detailLine: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음. `colors.primaryLight`/`radius.sm`/`spacing.xs` 같은 키가 없다고 하면 `src/constants/theme.ts`에 실제로 있는 키로 바꾼다(없는 값을 새로 추가하지 말 것).

- [ ] **Step 3: 커밋**

```bash
git add src/features/analysis/components/NumberHeatGrid.tsx
git commit -m "Show all 45 numbers at once, shaded by whichever measure the reader picked"
```

---

### Task 6: 조합 특성 분포 컴포넌트 (통계 칸 2/2)

**Files:**
- Create: `src/features/analysis/components/DistributionPanel.tsx`

**Interfaces:**
- Consumes: `ShapeDistribution`·`bandLabel`·`BAND_COUNT` (Task 2), `colors`/`spacing`/`radius`
- Produces: `DistributionPanel(props: { dist: ShapeDistribution; pickCount: number })`

막대는 `View`의 너비 비율로 그린다. `react-native-svg`는 이 모양에 필요하지 않다 — 가로 막대 하나를 그리려고 SVG를 꺼내는 건 과하다.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { BAND_COUNT, bandLabel, type ShapeDistribution } from "../historyStats";

interface Row {
  label: string;
  count: number;
}

function BarList({ rows, total }: { rows: Row[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <View style={styles.bars}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={styles.barLabel}>{r.label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(r.count / max) * 100}%` }]} />
          </View>
          <Text style={styles.barValue}>
            {r.count}
            {total > 0 ? ` (${((r.count / total) * 100).toFixed(0)}%)` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** 개수별 회차 수 배열을 "n개: m회차" 줄로. 0인 칸은 빼서 목록이 길어지지 않게 한다. */
function countRows(counts: number[], suffix: string): Row[] {
  return counts
    .map((count, n) => ({ label: `${n}${suffix}`, count }))
    .filter((r) => r.count > 0);
}

export function DistributionPanel({ dist, pickCount }: { dist: ShapeDistribution; pickCount: number }) {
  // 히스토그램이 비어 있는 양 끝 칸은 자른다. 6/45는 21~255가 가능하지만 실제로는 중앙에 몰려
  // 있어, 안 자르면 빈 막대 스무 줄을 스크롤해야 한다.
  const used = dist.sumHistogram.filter((b) => b.count > 0);

  return (
    <View style={styles.card}>
      <Text style={styles.header}>{dist.count}회차를 세었어요</Text>

      <Section title={`합계 — 평균 ${dist.sumMean.toFixed(1)} · 최소 ${dist.sumMin} · 최대 ${dist.sumMax}`}>
        <BarList rows={used.map((b) => ({ label: `${b.from}~${b.to}`, count: b.count }))} total={dist.count} />
      </Section>

      <Section title="홀짝">
        <BarList
          rows={dist.oddCounts
            .map((count, odd) => ({ label: `홀${odd} : 짝${pickCount - odd}`, count }))
            .filter((r) => r.count > 0)}
          total={dist.count}
        />
      </Section>

      <Section title="저(1~22) : 고(23~45)">
        <BarList
          rows={dist.lowCounts
            .map((count, low) => ({ label: `저${low} : 고${pickCount - low}`, count }))
            .filter((r) => r.count > 0)}
          total={dist.count}
        />
      </Section>

      <Section title="번호대">
        <BarList
          rows={Array.from({ length: BAND_COUNT }, (_, i) => ({
            label: bandLabel(i),
            count: dist.bandTotals[i],
          }))}
          total={dist.count * pickCount}
        />
      </Section>

      <Section title="가장 긴 연속번호">
        <BarList
          rows={countRows(dist.consecutiveCounts, "개 연속").filter((r) => r.label !== "0개 연속")}
          total={dist.count}
        />
      </Section>

      <Section title="같은 끝수 겹침">
        <BarList rows={countRows(dist.sameEndingCounts, "개").filter((r) => r.label !== "0개")} total={dist.count} />
      </Section>

      <Section title="직전 회차와 겹친 개수">
        <BarList rows={countRows(dist.carryOverCounts, "개")} total={Math.max(0, dist.count - 1)} />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  header: { fontSize: 13, color: colors.textMuted },
  section: { gap: spacing.xs },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  bars: { gap: 3 },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  barLabel: { width: 86, fontSize: 11, color: colors.textSecondary },
  barTrack: { flex: 1, height: 12, backgroundColor: colors.background, borderRadius: 6, overflow: "hidden" },
  barFill: { height: 12, backgroundColor: colors.primary, borderRadius: 6 },
  barValue: { width: 76, fontSize: 11, color: colors.textSecondary, textAlign: "right" },
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/features/analysis/components/DistributionPanel.tsx
git commit -m "Lay out what shapes past draws actually took, counted not theorised"
```

---

### Task 7: 후보 칸 컴포넌트

**Files:**
- Create: `src/features/analysis/components/CandidatePanel.tsx`

**Interfaces:**
- Consumes: `AnalysisSetup`·`LAB_WEIGHT_KEYS`·`WEIGHT_LABELS`·`GROUP_WEIGHT_KEYS`·`MAX_WEIGHT`·`LabWeightKey` (Task 4), `ScoredNumber` (`src/features/backtest/recipes.ts`), `sectorRanges`·`sectorIndexOf` (`src/features/backtest/recipes.ts`)
- Produces: `CandidatePanel(props: { setup: AnalysisSetup; onChange(next: AnalysisSetup): void; scored: ScoredNumber[]; candidates: number[]; maxNumber: number })`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import { StyleSheet, Text, View, Pressable } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { sectorIndexOf, sectorRanges } from "@/features/backtest/recipes";
import type { ScoredNumber } from "@/features/backtest/recipes";
import {
  GROUP_WEIGHT_KEYS,
  LAB_WEIGHT_KEYS,
  MAX_WEIGHT,
  WEIGHT_LABELS,
  type AnalysisSetup,
  type LabWeightKey,
} from "../analysisSetup";

const CANDIDATE_MIN = 10;
const CANDIDATE_MAX = 20;

// 끌어서 움직이는 슬라이더에는 네이티브 부품이 필요하고, 그걸 넣으면 새 빌드 + runtimeVersion
// 교체 + 구버전 고립 위험이 따라온다. 이 기능은 OTA로 끝나야 하므로 누르는 칩으로 받는다.
function WeightRow({
  weightKey,
  value,
  onChange,
}: {
  weightKey: LabWeightKey;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.weightRow}>
      <Text style={styles.weightLabel}>{WEIGHT_LABELS[weightKey]}</Text>
      <View style={styles.steps}>
        {Array.from({ length: MAX_WEIGHT + 1 }, (_, v) => (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            style={[styles.step, value === v && styles.stepActive]}
            accessibilityRole="button"
            accessibilityLabel={`${WEIGHT_LABELS[weightKey]} ${v}`}
          >
            <Text style={[styles.stepText, value === v && styles.stepTextActive]}>{v}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface Props {
  setup: AnalysisSetup;
  onChange: (next: AnalysisSetup) => void;
  /** 점수순으로 정렬된 전체 번호. */
  scored: ScoredNumber[];
  /** 최종 후보 번호(고정·제외·상한까지 적용된 것). */
  candidates: number[];
  maxNumber: number;
}

export function CandidatePanel({ setup, onChange, scored, candidates, maxNumber }: Props) {
  const useGroup = setup.groupCount !== undefined;
  const visibleKeys = LAB_WEIGHT_KEYS.filter((k) => useGroup || !GROUP_WEIGHT_KEYS.includes(k));
  const candidateSet = new Set(candidates);
  const sectors = sectorRanges(maxNumber);
  const perSector = sectors.map(
    (_, i) => candidates.filter((n) => sectorIndexOf(n, maxNumber) === i).length,
  );

  const toggle = (list: number[], n: number) =>
    list.includes(n) ? list.filter((x) => x !== n) : [...list, n].sort((a, b) => a - b);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>무엇을 얼마나 볼지</Text>
        <Text style={styles.hint}>0은 안 보는 것, 5가 가장 크게 보는 것이에요.</Text>
        {visibleKeys.map((key) => (
          <WeightRow
            key={key}
            weightKey={key}
            value={setup.weights[key]}
            onChange={(v) => onChange({ ...setup, weights: { ...setup.weights, [key]: v } })}
          />
        ))}

        <Pressable
          onPress={() => onChange({ ...setup, groupCount: useGroup ? undefined : 10 })}
          style={[styles.toggle, useGroup && styles.toggleOn]}
          accessibilityRole="button"
        >
          <Text style={[styles.toggleText, useGroup && styles.toggleTextOn]}>
            회차주기 그룹 {useGroup ? `쓰는 중 (${setup.groupCount}개로 나눔)` : "쓰지 않음"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>후보 수</Text>
        <View style={styles.steps}>
          {Array.from({ length: CANDIDATE_MAX - CANDIDATE_MIN + 1 }, (_, i) => CANDIDATE_MIN + i).map((n) => (
            <Pressable
              key={n}
              onPress={() => onChange({ ...setup, candidateCount: n })}
              style={[styles.step, setup.candidateCount === n && styles.stepActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.stepText, setup.candidateCount === n && styles.stepTextActive]}>{n}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          구간별 후보 수 — {sectors.map(([lo, hi], i) => `${lo}~${hi}: ${perSector[i]}`).join(" · ")}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>후보 (점수순)</Text>
        <Text style={styles.hint}>한 번 누르면 꼭 넣기, 두 번 누르면 꼭 빼기, 세 번 누르면 원래대로예요.</Text>
        <View style={styles.grid}>
          {scored.map((s) => {
            const pinned = setup.pinned.includes(s.number);
            const excluded = setup.excluded.includes(s.number);
            const inCandidates = candidateSet.has(s.number);
            return (
              <Pressable
                key={s.number}
                onPress={() => {
                  if (pinned) {
                    onChange({ ...setup, pinned: toggle(setup.pinned, s.number), excluded: toggle(setup.excluded, s.number) });
                  } else if (excluded) {
                    onChange({ ...setup, excluded: toggle(setup.excluded, s.number) });
                  } else {
                    onChange({ ...setup, pinned: toggle(setup.pinned, s.number) });
                  }
                }}
                style={[
                  styles.cell,
                  inCandidates && styles.cellIn,
                  pinned && styles.cellPinned,
                  excluded && styles.cellExcluded,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${s.number}번 ${pinned ? "꼭 넣기" : excluded ? "꼭 빼기" : inCandidates ? "후보" : "후보 아님"}`}
              >
                <Text style={[styles.cellNumber, excluded && styles.cellNumberOff]}>{s.number}</Text>
                <Text style={styles.cellScore}>{pinned ? "고정" : excluded ? "제외" : s.score.toFixed(2)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  weightRow: { gap: 4 },
  weightLabel: { fontSize: 13, color: colors.textPrimary },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  step: {
    minWidth: 34,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  stepActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  stepText: { fontSize: 13, color: colors.textSecondary },
  stepTextActive: { color: colors.primaryDark, fontWeight: "700" },
  toggle: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleOn: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  toggleText: { fontSize: 13, color: colors.textSecondary },
  toggleTextOn: { color: colors.primaryDark, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  cell: {
    width: 46,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cellIn: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  cellPinned: { backgroundColor: colors.goldLight, borderColor: colors.seal, borderWidth: 2 },
  cellExcluded: { backgroundColor: colors.background, borderColor: colors.border, opacity: 0.5 },
  cellNumber: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  cellNumberOff: { color: colors.textMuted },
  cellScore: { fontSize: 9, color: colors.textSecondary },
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/features/analysis/components/CandidatePanel.tsx
git commit -m "Let the reader weigh what matters, then overrule the score by hand"
```

---

### Task 8: 조합 칸 컴포넌트

**Files:**
- Create: `src/features/analysis/components/ComboPanel.tsx`

**Interfaces:**
- Consumes: `AnalysisSetup` (Task 4), `ComboPick`·`pickCombos` (Task 3), `LottoBall`, `FilterConfig`
- Produces: `ComboPanel(props: { setup: AnalysisSetup; onChange(next: AnalysisSetup): void; pick: ComboPick; gameCount: number; onGameCountChange(n: number): void; onSave(): void; onShare(): void; saving: boolean })`

필터 조절은 "흔히 쓰는 값" 칩으로 받는다. 숫자 입력창을 열면 키보드가 화면 절반을 덮고 잘못된 값(합계 21~22 같은, 통과 조합 0개)을 받기 쉽다.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import { StyleSheet, Text, View, Pressable } from "react-native";
import { LottoBall } from "@/components/LottoBall";
import { colors, radius, spacing } from "@/constants/theme";
import type { FilterConfig } from "@/features/backtest/types";
import type { ComboPick } from "../comboPicker";
import type { AnalysisSetup } from "../analysisSetup";

const SUM_RANGES: readonly { label: string; value: [number, number] | undefined }[] = [
  { label: "제한 없음", value: undefined },
  { label: "100~175", value: [100, 175] },
  { label: "109~167", value: [109, 167] },
  { label: "120~160", value: [120, 160] },
];

const RATIO_SETS: readonly { label: string; value: [number, number][] | undefined }[] = [
  { label: "제한 없음", value: undefined },
  { label: "2:4 ~ 4:2", value: [[2, 4], [3, 3], [4, 2]] },
  { label: "3:3만", value: [[3, 3]] },
];

const CONSECUTIVE: readonly { label: string; value: number | undefined }[] = [
  { label: "제한 없음", value: undefined },
  { label: "연속 없음", value: 1 },
  { label: "2연속까지", value: 2 },
];

const SAME_ENDING: readonly { label: string; value: number | undefined }[] = [
  { label: "제한 없음", value: undefined },
  { label: "겹침 없음", value: 1 },
  { label: "2개까지", value: 2 },
];

const CARRY_OVER: readonly { label: string; value: [number, number] | undefined }[] = [
  { label: "제한 없음", value: undefined },
  { label: "0개", value: [0, 0] },
  { label: "1개 이하", value: [0, 1] },
  { label: "1개 이상", value: [1, 6] },
];

const GAME_COUNTS = [1, 5, 10, 20] as const;

function ChipRow<T>({
  title,
  options,
  selected,
  onPick,
}: {
  title: string;
  options: readonly { label: string; value: T }[];
  selected: (v: T) => boolean;
  onPick: (v: T) => void;
}) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{title}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Pressable
            key={o.label}
            onPress={() => onPick(o.value)}
            style={[styles.chip, selected(o.value) && styles.chipActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, selected(o.value) && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const sameRange = (a?: [number, number], b?: [number, number]) =>
  a === undefined && b === undefined ? true : !!a && !!b && a[0] === b[0] && a[1] === b[1];

const sameRatios = (a?: [number, number][], b?: [number, number][]) =>
  a === undefined && b === undefined
    ? true
    : !!a && !!b && a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

interface Props {
  setup: AnalysisSetup;
  onChange: (next: AnalysisSetup) => void;
  pick: ComboPick;
  gameCount: number;
  onGameCountChange: (n: number) => void;
  onSave: () => void;
  onShare: () => void;
  saving: boolean;
}

export function ComboPanel({ setup, onChange, pick, gameCount, onGameCountChange, onSave, onShare, saving }: Props) {
  const setFilters = (patch: Partial<FilterConfig>) =>
    onChange({ ...setup, filters: { ...setup.filters, ...patch } });

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>조합 조건</Text>

        <ChipRow
          title="합계"
          options={SUM_RANGES}
          selected={(v) => sameRange(v, setup.filters.sumRange)}
          onPick={(v) => setFilters({ sumRange: v })}
        />
        <ChipRow
          title="홀짝"
          options={RATIO_SETS}
          selected={(v) => sameRatios(v, setup.filters.oddEven)}
          onPick={(v) => setFilters({ oddEven: v })}
        />
        <ChipRow
          title="저:고"
          options={RATIO_SETS}
          selected={(v) => sameRatios(v, setup.filters.lowHigh)}
          onPick={(v) => setFilters({ lowHigh: v })}
        />
        <ChipRow
          title="연속번호"
          options={CONSECUTIVE}
          selected={(v) => v === setup.filters.maxConsecutive}
          onPick={(v) => setFilters({ maxConsecutive: v })}
        />
        <ChipRow
          title="같은 끝수"
          options={SAME_ENDING}
          selected={(v) => v === setup.filters.maxSameEndingDigit}
          onPick={(v) => setFilters({ maxSameEndingDigit: v })}
        />
        <ChipRow
          title="직전 회차 겹침"
          options={CARRY_OVER}
          selected={(v) => sameRange(v, setup.filters.previousDrawOverlap)}
          onPick={(v) => setFilters({ previousDrawOverlap: v })}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.count}>
          후보로 만들 수 있는 조합 {pick.total.toLocaleString()}개 중{" "}
          <Text style={styles.countStrong}>{pick.passing.toLocaleString()}개</Text>가 조건을 통과했어요
        </Text>
        {pick.passing === 0 && <Text style={styles.warn}>조건이 좁아서 통과하는 조합이 없어요. 조건을 풀어보세요.</Text>}

        <ChipRow
          title="만들 게임 수"
          options={GAME_COUNTS.map((n) => ({ label: `${n}게임`, value: n }))}
          selected={(v) => v === gameCount}
          onPick={onGameCountChange}
        />

        {pick.games.length > 0 && pick.games.length < gameCount && (
          <Text style={styles.warn}>
            조건을 통과한 조합이 {pick.passing}개라 {pick.games.length}게임만 만들었어요.
          </Text>
        )}

        <View style={styles.games}>
          {pick.games.map((game) => (
            <View key={game.join(",")} style={styles.game}>
              {game.map((n) => (
                <LottoBall key={n} number={n} size="small" />
              ))}
            </View>
          ))}
        </View>

        {pick.games.length > 0 && (
          <View style={styles.buttons}>
            <Pressable style={styles.button} onPress={onSave} disabled={saving} accessibilityRole="button">
              <Text style={styles.buttonText}>{saving ? "저장 중..." : "보관함에 저장"}</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={onShare} accessibilityRole="button">
              <Text style={styles.buttonText}>번호 보내기</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  filterRow: { gap: 4 },
  filterLabel: { fontSize: 13, color: colors.textPrimary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textSecondary },
  chipTextActive: { color: colors.primaryDark, fontWeight: "700" },
  count: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  countStrong: { color: colors.textPrimary, fontWeight: "700" },
  warn: { fontSize: 12, color: colors.danger, lineHeight: 18 },
  games: { gap: spacing.xs },
  game: { flexDirection: "row", gap: 4, alignItems: "center" },
  buttons: { flexDirection: "row", gap: spacing.sm },
  button: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
  },
  buttonText: { fontSize: 13, color: colors.primaryDark, fontWeight: "700" },
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/features/analysis/components/ComboPanel.tsx
git commit -m "Say how many combinations survive the conditions, then hand over that many games"
```

---

### Task 9: 화면 조립 및 메뉴 등록

**Files:**
- Create: `app/(tabs)/more/lab.tsx`
- Modify: `app/(tabs)/more/_layout.tsx` (Stack.Screen 한 줄 추가)
- Modify: `app/(tabs)/more/index.tsx` (MENU_ITEMS에 한 줄 추가)
- Modify: `src/features/generator/sourceLabel.ts` (분석실 라벨)
- Modify: `src/features/generator/recordGeneratedTickets.ts` (`LAB_SOURCE` 추가)

**Interfaces:**
- Consumes: Task 1~8의 모든 produce + `getDrawsForBacktest`, `analyzeWithRecipe`가 아니라 `computeNumberStats`·`scoreNumbers`·`topCandidates`·`topCandidatesCapped` (`src/features/backtest/recipes.ts`), `seededRng` (`engine.ts`), `upcomingDrawNo` (`src/features/generator/geniusGenerator.ts`), `useMyLottoTickets`, `recordGeneratedTickets`
- Produces: `/more/lab` 라우트

- [ ] **Step 1: 집계 출처 라벨 추가**

`src/features/generator/recordGeneratedTickets.ts`의 `BAND_SOURCE` 아래에 한 줄 추가:

```ts
export const LAB_SOURCE = "lab";
```

`src/features/generator/sourceLabel.ts`의 `sourceLabel` 함수에서 `BAND_SOURCE` 처리 바로 아래에 한 줄 추가하고 import도 함께 고친다:

```ts
import { BAND_SOURCE, LAB_SOURCE } from "./recordGeneratedTickets";
// ...
  if (source === LAB_SOURCE) return "번호 분석실";
```

- [ ] **Step 2: `lab.tsx` 작성**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { colors, radius, spacing } from "@/constants/theme";
import { getDrawsForBacktest } from "@/features/backtest/api/backtestDrawsApi";
import { seededRng } from "@/features/backtest/engine";
import {
  computeNumberStats,
  modGroupOf,
  scoreNumbers,
  sectorIndexOf,
  topCandidates,
  topCandidatesCapped,
} from "@/features/backtest/recipes";
import { KOREA_LOTTO_6_45 } from "@/features/backtest/types";
import { upcomingDrawNo } from "@/features/generator/geniusGenerator";
import { LAB_SOURCE, recordGeneratedTickets } from "@/features/generator/recordGeneratedTickets";
import { useMyLottoTickets } from "@/features/mylotto/useMyLottoTickets";
import {
  ALL_ROUNDS,
  SPAN_OPTIONS,
  defaultSetup,
  toRecipeWeights,
  windowOf,
  type AnalysisSetup,
} from "@/features/analysis/analysisSetup";
import { pickCombos } from "@/features/analysis/comboPicker";
import { gapStats, pairCounts, shapeDistribution, topPartners } from "@/features/analysis/historyStats";
import { CandidatePanel } from "@/features/analysis/components/CandidatePanel";
import { ComboPanel } from "@/features/analysis/components/ComboPanel";
import { DistributionPanel } from "@/features/analysis/components/DistributionPanel";
import { NumberHeatGrid, type HeatMetric } from "@/features/analysis/components/NumberHeatGrid";
import { useAnalysisSetups } from "@/features/analysis/useAnalysisSetups";

const RULE = KOREA_LOTTO_6_45;
const TABS = [
  { key: "stats", label: "통계" },
  { key: "candidates", label: "후보" },
  { key: "combos", label: "조합" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function LabScreen() {
  const insets = useSafeAreaInsets();
  const { data: draws, isLoading, error } = useQuery({
    queryKey: ["backtest", "draws"],
    queryFn: getDrawsForBacktest,
    staleTime: 60 * 60 * 1000,
  });

  const [tab, setTab] = useState<TabKey>("stats");
  const [metric, setMetric] = useState<HeatMetric>("count");
  const [setup, setSetup] = useState<AnalysisSetup>(defaultSetup);
  const [gameCount, setGameCount] = useState(5);
  const [saving, setSaving] = useState(false);

  const saveSetup = useAnalysisSetups((s) => s.save);
  const drawNo = useMemo(() => upcomingDrawNo(), []);
  const addTickets = useMyLottoTickets((s) => s.addTickets);

  // 선택 구간. 출현 횟수·동반 출현·조합 특성 분포에만 쓴다.
  const window = useMemo(() => (draws ? windowOf(draws, setup.span) : []), [draws, setup.span]);
  const spanLabel = useMemo(
    () => SPAN_OPTIONS.find((o) => o.value === setup.span)?.label ?? "전체",
    [setup.span],
  );

  const counts = useMemo(() => {
    const out = new Array<number>(RULE.maxNumber + 1).fill(0);
    for (const d of window) for (const n of d.numbers) out[n] += 1;
    return out;
  }, [window]);

  // 미출현 기간과 출현 간격은 **전체 회차** 기준이다. 구간을 자르면 "11회 전에 나온 번호"가
  // "10회 미출현"으로 보여 거짓이 된다.
  const gaps = useMemo(() => (draws ? gapStats(draws, RULE) : []), [draws]);
  const pairs = useMemo(() => pairCounts(window, RULE), [window]);
  const dist = useMemo(() => shapeDistribution(window, RULE), [window]);
  const partnersOf = useCallback((n: number) => topPartners(pairs, n, 5), [pairs]);

  // 점수: 전체 회차를 넣고 "최근"의 길이만 선택 구간으로 준다 - totalFrequency는 전체,
  // recentFrequency·구간 균형은 선택 구간이 되어 둘을 가중치로 섞을 수 있다.
  const scored = useMemo(() => {
    if (!draws || draws.length === 0) return [];
    const recentWindow = setup.span === ALL_ROUNDS ? draws.length : setup.span;
    const grouping = setup.groupCount !== undefined ? { kind: "round-cycle" as const, groupCount: setup.groupCount } : undefined;
    const targetGroup = grouping ? ((drawNo % grouping.groupCount) + grouping.groupCount) % grouping.groupCount : undefined;
    const stats = computeNumberStats(draws, RULE, recentWindow, grouping, targetGroup);
    return scoreNumbers(stats, toRecipeWeights(setup)).sort((a, b) => b.score - a.score || a.number - b.number);
  }, [draws, setup, drawNo]);

  const candidates = useMemo(() => {
    const allowed = scored.filter((s) => !setup.excluded.includes(s.number));
    const room = Math.max(0, setup.candidateCount - setup.pinned.length);
    const auto =
      setup.sectorCap !== undefined
        ? topCandidatesCapped(allowed, room, setup.sectorCap, (n) => sectorIndexOf(n, RULE.maxNumber))
        : setup.modGroupCap !== undefined
          ? topCandidatesCapped(allowed, room, setup.modGroupCap, modGroupOf)
          : topCandidates(allowed, room);
    return [...new Set([...setup.pinned, ...auto.map((c) => c.number)])].sort((a, b) => a - b);
  }, [scored, setup]);

  const pick = useMemo(
    () =>
      pickCombos({
        candidates,
        pinned: setup.pinned,
        rule: RULE,
        filters: setup.filters,
        count: gameCount,
        rng: seededRng(`lab|${drawNo}|${JSON.stringify(setup)}|${gameCount}`),
        previousDraw: draws?.[draws.length - 1],
      }),
    [candidates, setup, gameCount, drawNo, draws],
  );

  // 화면에 뜬 번호를 익명으로 집계한다(기존 생성기와 같은 규칙). 같은 조합을 두 번 세지
  // 않도록 이미 보낸 것은 기억해 둔다.
  const sentRef = useRef(new Set<string>());
  useEffect(() => {
    const fresh = pick.games.filter((g) => !sentRef.current.has(g.join(",")));
    if (fresh.length === 0) return;
    for (const g of fresh) sentRef.current.add(g.join(","));
    recordGeneratedTickets(LAB_SOURCE, drawNo, fresh);
  }, [pick.games, drawNo]);

  const save = useCallback(() => {
    if (pick.games.length === 0) return;
    setSaving(true);
    const added = addTickets(
      pick.games.map((numbers) => ({ drawNo, numbers, purchaseType: null, purchased: false })),
    );
    setSaving(false);
    Alert.alert(
      "보관함에 저장했어요",
      added.length === pick.games.length
        ? `${added.length}게임을 ${drawNo}회로 저장했어요.`
        : `${added.length}게임을 저장했어요. 이미 저장된 조합은 건너뛰었어요.`,
    );
  }, [pick.games, addTickets, drawNo]);

  const share = useCallback(() => {
    if (pick.games.length === 0) return;
    const body = pick.games.map((g, i) => `${i + 1}. ${g.join(" ")}`).join("\n");
    void Share.share({ message: `${drawNo}회 내 분석 번호\n${body}` });
  }, [pick.games, drawNo]);

  const store = useCallback(() => {
    const name = `${spanLabel} · 후보 ${setup.candidateCount}개`;
    saveSetup({ ...setup, id: `${Date.now()}`, name, savedAt: new Date().toISOString() });
    Alert.alert("설정을 저장했어요", `"${name}"으로 폰에 저장했어요.`);
  }, [saveSetup, setup, spanLabel]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.centerText}>회차를 불러오는 중이에요</Text>
      </View>
    );
  }

  if (error || !draws || draws.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>회차를 불러오지 못했어요. 잠시 뒤에 다시 열어주세요.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={styles.chips}>
        {SPAN_OPTIONS.map((o) => (
          <Pressable
            key={o.label}
            onPress={() => setSetup((s) => ({ ...s, span: o.value }))}
            style={[styles.chip, setup.span === o.value && styles.chipActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, setup.span === o.value && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.meta}>
        {draws[0].round}~{draws[draws.length - 1].round}회 중 {window.length}회차를 보고 있어요
      </Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "stats" && (
        <View style={styles.panel}>
          <NumberHeatGrid
            metric={metric}
            onMetricChange={setMetric}
            counts={counts}
            gaps={gaps}
            partnersOf={partnersOf}
            spanLabel={spanLabel}
            maxNumber={RULE.maxNumber}
          />
          <DistributionPanel dist={dist} pickCount={RULE.pickCount} />
        </View>
      )}

      {tab === "candidates" && (
        <CandidatePanel
          setup={setup}
          onChange={setSetup}
          scored={scored}
          candidates={candidates}
          maxNumber={RULE.maxNumber}
        />
      )}

      {tab === "combos" && (
        <ComboPanel
          setup={setup}
          onChange={setSetup}
          pick={pick}
          gameCount={gameCount}
          onGameCountChange={setGameCount}
          onSave={save}
          onShare={share}
          saving={saving}
        />
      )}

      <Pressable style={styles.storeButton} onPress={store} accessibilityRole="button">
        <Text style={styles.storeButtonText}>이 설정 저장</Text>
      </Pressable>

      <Text style={styles.disclaimer}>통계 참고용이며 당첨 확률을 높여주지 않습니다.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.background },
  centerText: { fontSize: 13, color: colors.textSecondary, textAlign: "center", paddingHorizontal: spacing.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textSecondary },
  chipTextActive: { color: colors.primaryDark, fontWeight: "700" },
  meta: { fontSize: 11, color: colors.textMuted },
  tabs: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, color: colors.textSecondary, fontWeight: "700" },
  tabTextActive: { color: "#fff" },
  panel: { gap: spacing.md },
  storeButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  storeButtonText: { fontSize: 13, color: colors.textSecondary, fontWeight: "700" },
  disclaimer: { fontSize: 11, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm },
});
```

- [ ] **Step 3: `_layout.tsx`에 화면 등록**

`app/(tabs)/more/_layout.tsx`의 `<Stack>` 안, `generator` 줄 아래에 추가. 빠뜨리면 헤더 제목이 "lab"으로 뜬다(스피또에서 그랬다).

```tsx
      <Stack.Screen name="lab" options={{ title: "번호 분석실" }} />
```

- [ ] **Step 4: 더보기 메뉴에 등록**

`app/(tabs)/more/index.tsx`의 `MENU_ITEMS` 배열, `generator` 줄 아래에 추가. 먼저 `adminOnly: true`로 올려 실기기에서 확인하고, 괜찮으면 그 속성만 지워 공개한다.

```tsx
  { key: "lab", emoji: "🔬", label: "번호 분석실", href: "/more/lab", adminOnly: true },
```

- [ ] **Step 5: 타입체크 + 전체 테스트**

Run: `npm run typecheck && npx jest`
Expected: 타입 에러 없음, 테스트 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add app/\(tabs\)/more/lab.tsx app/\(tabs\)/more/_layout.tsx app/\(tabs\)/more/index.tsx src/features/generator/sourceLabel.ts src/features/generator/recordGeneratedTickets.ts
git commit -m "Put the reading, the weighing and the drawing on one screen"
```

- [ ] **Step 7: 실기기 확인 (유저가 직접)**

`npx expo start` 후 관리자 계정으로 더보기 → 번호 분석실. 확인할 것:

1. 구간 칩을 바꾸면 출현 횟수와 분포가 바뀌고, **미출현 기간·평균 간격은 안 바뀐다**(전체 기준이라 맞다).
2. 번호를 누르면 상세가 열리고 "함께 많이 나온 번호"에 5개가 뜬다.
3. 가중치 칩을 바꾸면 후보 칸의 순서가 즉시 바뀐다(기다림 없음).
4. 번호를 눌러 고정 → 조합 칸의 모든 게임에 그 번호가 들어간다.
5. 합계를 "120~160" + 홀짝 "3:3만"으로 좁히면 통과 조합 수가 줄고, 0이 되면 경고가 뜬다.
6. 보관함 저장 → 보관함에서 그 게임이 보이고 "안 산 번호"로 들어간다.
7. 비행기 모드로 앱을 완전히 닫고 다시 열어 → 분석실이 저장분으로 열린다.

- [ ] **Step 8: 공개 + OTA 배포 (유저 확인 뒤)**

`adminOnly: true`를 지우고 커밋한 다음:

```bash
npm run ota -- "번호 분석실 추가"
```

배포 후 `npm run ota:verify`로 채널 런타임 표식이 설치 빌드와 같은지 확인한다. 네이티브 변경이 없으므로 `runtimeVersion`은 건드리지 않는다.

---

## 자기 점검 결과

**스펙 대조** — 스펙의 모든 절이 과제에 들어갔다:

| 스펙 | 과제 |
|---|---|
| 회차 데이터 폰 저장 + 증분 수신 + 오프라인 | Task 1 |
| 동반 출현 · 출현 간격 · 조합 특성 분포 | Task 2 |
| 통과 조합 수 + 조합 생성 | Task 3 |
| 내 설정 저장 (폰에만) | Task 4 |
| 번호판 45개 + 번호 상세 | Task 5 |
| 조합 특성 분포 7종 | Task 6 |
| 가중치 8종 + 후보 수·상한 + 고정/제외 | Task 7 |
| 필터 7종 + 통과 수 + 생성 + 저장/공유 | Task 8 |
| 화면 조립 · 메뉴 · 집계 라벨 · OTA | Task 9 |

**스펙과 달라진 점 두 가지** (스펙에 "backtest 폴더는 손대지 않는다"고 썼으나):

1. `src/features/backtest/api/backtestDrawsApi.ts`는 Task 1에서 **고친다** — 캐시를 거치게 하려면 불가피하고, 이게 폰 저장의 핵심이다.
2. 조합 추출은 엔진의 비공개 `fillTickets`를 export하는 대신 `comboPicker.ts`에 **새로 썼다**(Task 3). 엔진 쪽은 개수를 맞추려고 필터를 포기하는데, 유저가 직접 건 조건을 버리는 건 도구로서 틀렸다. 그래서 `backtest/` 폴더는 결국 `api/` 파일 하나만 바뀐다.

**스펙에서 줄인 것**: 스펙은 필터에 `minFibonacciGaps`(피보나치 간격)를 넣었지만 Task 8 화면에서는 뺐다 — 피보나치를 쓰지 않기로 한 결정과 어긋난다. 엔진 필드는 그대로 남아 있어 나중에 칩 한 줄로 되살릴 수 있다.

**플레이스홀더 점검**: TBD·TODO·"적절히 처리" 없음. 모든 코드 단계에 실제 코드가 있다.

**타입 일관성 점검**: `AnalysisSetup`(Task 4)의 필드명이 Task 7·8·9에서 같게 쓰였다(`weights`/`candidateCount`/`sectorCap`/`modGroupCap`/`groupCount`/`pinned`/`excluded`/`filters`/`span`). `ComboPick`(Task 3)의 `total`/`passing`/`games`가 Task 8·9에서 같게 쓰였다. `NumberGapStats`(Task 2)의 `roundsSince`/`meanGap`/`minGap`/`maxGap`/`appearances`/`lastRound`가 Task 5에서 같게 쓰였다. `HeatMetric`(Task 5)이 Task 9에서 같은 이름으로 쓰였다.
