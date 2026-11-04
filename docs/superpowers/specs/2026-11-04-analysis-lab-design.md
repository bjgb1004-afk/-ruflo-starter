# 번호 분석실 — 설계

작성 2026-11-04. 승인됨.

## 무엇을 만드나

자기 분석을 믿고 번호를 사는 사람들이 쓸 **분석 도구**를 앱 안에 대시보드로 넣는다.
과거 회차 통계를 읽는 칸, 그 통계로 후보 번호를 추리는 칸, 추린 후보에서 조합을 만드는 칸.
새 화면 1개 + 새 집계 파일 1개 + 회차 데이터 폰 저장 1개.

판정하지 않는다. "이 방법이 낫다/아니다", "확률이 오르지 않는다" 같은 비교·훈계 문구를 넣지
않는다. 앱 전체에 이미 있는 한 줄짜리 고지문("통계 참고용이며 당첨 확률을 높여주지 않습니다")만
남긴다 — 스토어 정책 때문이고, 그건 비교 멘트가 아니다.

## 왜 백테스트를 붙이지 않나

처음 설계에는 백테스트 비교·순위표·학습/검증 구간 분리가 들어 있었다. 빼기로 했다.

- **예측에는 의미가 없다.** 1,243회차로 이미 실측했고 어떤 방법도 무작위를 넘지 못했다
  (`tasks/lessons.md`, `scripts/runBacktest.ts`). 순위표를 내놓으면 없는 차이를 있다고 말하게 된다.
- **이 도구를 쓸 사람에게 쓸모가 없다.** 자기 분석을 믿는 사람은 "내 방법이 무작위보다 낫다는
  증명"을 원하는 게 아니라 **통계를 읽고 번호를 좁히는 작업대**를 원한다.
- 겨룰 상대를 안 만들면 과적합 유도도 구조적으로 안 생긴다. 점수를 올릴 대상이 없으므로
  유저가 가중치를 "성적 좋은 쪽"으로 돌릴 이유 자체가 없다.

백테스트 엔진(`src/features/backtest/`)은 **그대로 둔다.** 점수·후보·필터·생성 코드를 이 화면이
그대로 재사용하고, 개발용 스크립트(`scripts/runBacktest.ts`)도 계속 돌아간다. 화면에 안 내놓는
것은 "겨루기 UI"뿐이다.

## 회차 데이터 폰 저장 (이게 제일 값어치 크다)

지금 `getDrawsForBacktest()`는 앱을 켤 때마다 회차 전체를 다시 받는다(응답 원본 240KB,
gzip 전송 약 18KB). react-query 캐시는 메모리라 앱을 닫으면 사라진다.

바꾼 뒤: 한 번 받아 `AsyncStorage`에 저장하고, 그다음부터는 **저장된 마지막 회차보다 큰 것만**
받아 이어붙인다(토요일마다 1건, 0.2KB).

```
처음:    전체 페이징 수신 → AsyncStorage 저장
그 뒤:   저장분 읽기 → draw_no > 마지막 회차만 수신 → 이어붙여 저장
오프라인: 저장분만으로 전 회차 분석이 돈다
```

전송량 계산 (실측: 1,243건 응답 원본 240KB, gzip 18KB. Supabase 무료 전송량 5GB/월):

| 유저 수 × 하루 1회 실행 | 지금 | 폰 저장 후 |
|---|---|---|
| 1,000명 | 18KB × 1,000 × 30일 = **0.5GB/월** (한도의 10%) | 주 1회 1건 140B → **월 0.5MB** |
| 10,000명 | **5.1GB/월 → 한도 초과** | 월 5MB |

지금 유저 100명 미만에서는 한도가 당장 문제는 아니다(월 50MB). 값어치는 두 가지다 —
**유저가 앱을 켤 때마다 240KB를 기다리지 않는 것**(모바일 데이터에서 체감된다), 그리고
유저가 1만 명이 되면 한도를 넘는 구조를 미리 없애는 것. 이 변경 하나로 기존 '놓친 당첨금'(`app/replay.tsx`)과
'천재들의 한수'(`app/(tabs)/more/generator.tsx`)도 같이 빨라진다 — 셋이 같은 함수를 쓴다.

폰에 차지하는 용량: `LottoDraw` 모양으로 저장해 1,243건 약 115KB(실측). 매년 52회씩 늘어
연 5KB. Android AsyncStorage 기본 한도(6MB)에 수십 년 여유가 있다.

구현은 `getDrawsForBacktest()` 안에 넣는다. 새 store를 만들지 않는다 — 부르는 쪽 세 군데가
고치지 않아도 혜택을 받는다.

## 화면 구성

`app/(tabs)/more/lab.tsx`. 더보기 메뉴에 "번호 분석실"로 넣는다.

맨 위에 칩 3개로 칸을 바꾼다: **통계 · 후보 · 조합.** 한 화면에 다 쌓으면 스크롤이 너무 길다.

### 공통 — 구간 선택

맨 위에 구간 칩: `최근 10 / 30 / 50 / 100회 / 전체`. 이걸 바꾸면 세 칸 전부가 같이 움직인다.
"최근"의 정의가 칸마다 다르면 읽는 사람이 헷갈린다.

### 1. 통계 칸

**번호판 45개** — 공 45개를 격자로 깔고 **한 가지 지표를 색 농도로** 표시한다.
지표 전환 칩: `출현 횟수 · 미출현 기간 · 평균 출현 간격`.

번호를 누르면 그 번호 상세가 아래 펼쳐진다:

> **23번**
> 출현 142회 (선택 구간) · 마지막 출현 1240회 (4회 전)
> 출현 간격 — 평균 8.7회 / 최단 1회 / 최장 41회
> 함께 많이 나온 번호 — 7(31회) 34(28회) 11(27회) 45(26회) 2(25회)

"함께 많이 나온 번호"가 유저 목록 ⑪ 동반 출현이다. 엔진에 유일하게 없던 항목이라 새로 넣는다.

**조합 특성 분포** — 선택 구간의 **실제 과거 회차**를 세서 그대로 보여준다. 이론값과 비교하지 않는다.

| 항목 | 보여주는 모양 |
|---|---|
| 합계 | 히스토그램 (10 단위 구간), 평균·최소·최대 |
| 홀짝 | 6:0 / 5:1 / 4:2 / 3:3 / 2:4 / 1:5 / 0:6 별 회차 수 |
| 고저 (1~22 : 23~45) | 같은 모양 |
| 구간 분포 (1~10, 11~20, 21~30, 31~40, 41~45) | 구간별 출현 횟수 |
| 연속번호 | 연속 쌍이 0개·1개·2개 이상인 회차 수 |
| 같은 끝수 | 끝수가 겹치는 번호가 0·2·3개 이상인 회차 수 |
| 이월수 (직전 회차와 겹친 개수) | 0·1·2·3개 이상인 회차 수 |

히스토그램은 `react-native-svg`로 그린다(이미 의존성에 있음).

### 2. 후보 칸

**가중치 8종.** 피보나치 근접·서로소 비율(오일러)은 **쓰지 않는다** — 과거 데이터와 무관하게
번호 자체로 정해지는 값이고, 이미 '천재들의 한수' 화면에 있다.

| 화면 문구 | 엔진 가중치 |
|---|---|
| 전체 출현 횟수 | `totalFrequency` |
| 최근 출현 횟수 | `recentFrequency` |
| 안 나온 기간 | `gap` |
| 구간 균형 | `sectorBalance` |
| 나머지그룹 균형 | `modBalance` |
| 기대치 근접 | `frequencyTypicality` |
| 같은 그룹 출현 횟수 | `groupFrequency` |
| 같은 그룹 미출현 | `groupGap` |

뒤 두 개는 회차주기 그룹(`grouping`)을 켠 경우에만 뜬다. 그룹 수도 고를 수 있게 둔다(기본 10).

**조절은 슬라이더가 아니라 0~5 단계 칩/버튼이다.** 끌어서 움직이는 슬라이더에는 네이티브
의존성(`@react-native-community/slider` 또는 `gesture-handler`)이 필요하고, 그걸 추가하면
새 빌드 + `runtimeVersion` 교체 + 구버전 고립 위험이 따라온다. 지금 이 기능은 OTA로 끝나야
한다. `Pressable` 칩 6개면 같은 일을 한다.

밀면 즉시:
- 45개가 점수순으로 다시 줄 선다 (점수도 같이 표시)
- 상위 N개가 후보로 잡힌다 — N은 10~20 사이에서 직접 지정 (기본 15)
- 구간별 상한 / 나머지그룹별 상한을 걸 수 있다 (한쪽 구간에 후보가 몰리는 걸 막는 용도)
- 후보가 구간별로 몇 개씩 들어갔는지 바로 보인다

**손으로 고치기.** 번호를 눌러 **꼭 넣기(고정) / 꼭 빼기(제외).** 고정한 번호는 점수와 무관하게
후보에 남고, 제외한 번호는 점수가 높아도 빠진다. 자동 점수를 쓰는 사람과 자기 판단으로
확정하는 사람이 같은 화면에서 끝낼 수 있어야 한다.

계산량: `computeNumberStats` + `scoreNumbers`가 1,243회차에서 50ms 미만이다. 진행률 표시도,
쪼개 돌리기도 필요 없다 — 칩을 누르면 바로 바뀐다.

### 3. 조합 칸

필터 7종. 엔진 `FilterConfig`를 그대로 쓴다. 안 건드린 항목은 꺼진 것이다.

| 화면 문구 | 엔진 필드 |
|---|---|
| 합계 범위 | `sumRange` |
| 홀짝 | `oddEven` |
| 고저 | `lowHigh` |
| 연속번호 최대 길이 | `maxConsecutive` |
| 같은 끝수 최대 개수 | `maxSameEndingDigit` |
| 이월수 범위 | `previousDrawOverlap` |
| 피보나치 간격 최소 개수 | `minFibonacciGaps` |

조건을 바꾸면 **통과 조합 수가 즉시** 뜬다:

> 후보 15개로 만들 수 있는 조합 5,005개 중 **1,284개**가 조건을 통과

세는 범위는 **후보 안**이다(`countPassingCombinations`). 후보 20개면 C(20,6)=38,760개로
즉시 끝난다. 45개 전체 기준(814만 개)은 전수로 세면 폰에서 수십 초가 걸려 하지 않는다.

그다음 게임 수를 골라 생성한다(1~20게임). 중복 조합은 `comboKey`로 걸러낸다.
생성한 번호는 **보관함에 저장**(`useMyLottoTickets`) / **번호 보내기**(Share)로 내보낸다.

익명 수집은 기존 생성기와 같게 `recordGeneratedTickets`로 붙인다(성적표 집계용, 2026-10-19 결정).
출처 라벨은 새로 하나 추가한다.

### 내 설정 저장

가중치·후보 수·상한·고정/제외·필터를 한 세트로 묶어 이름 붙여 저장한다. 여러 개 두고 불러 쓴다.
`zustand` + `AsyncStorage` persist — 즐겨찾기·보관함과 같은 방식.

**폰에만 저장한다.** 서버에 올리지 않고 로그인을 붙이지 않는다. 앱을 지우면 사라진다
(2026-11-01 결정 그대로). 남의 설정 보기·순위표는 만들지 않는다.

## 엔진에 새로 넣는 것

`src/features/analysis/historyStats.ts` (새 파일, 순수 함수, React 의존 없음)

```ts
/** 번호 쌍이 함께 나온 횟수. 45×45 중 상삼각만. */
export function pairCounts(draws: readonly LottoDraw[], rule: LottoRule): number[][];

/** 한 번호의 동반 출현 상위 N개. */
export function topPartners(pairs: number[][], n: number, limit: number): { number: number; count: number }[];

/** 번호별 출현 간격 통계. 간격이 하나도 없으면(0~1회 출현) null. */
export function gapStats(draws: readonly LottoDraw[], rule: LottoRule)
  : { number: number; mean: number | null; min: number | null; max: number | null; lastRound: number | null }[];

/** 회차 하나의 조합 특성. */
export function shapeOf(draw: LottoDraw, rule: LottoRule, previous?: LottoDraw)
  : { sum: number; odd: number; low: number; sectors: number[]; maxConsecutive: number; maxSameEnding: number; carryOver: number | null };

/** 구간 전체의 특성 분포. 위 shapeOf를 세어 모은 것. */
export function shapeDistribution(draws: readonly LottoDraw[], rule: LottoRule): ShapeDistribution;
```

전부 1,243회차에서 50ms 미만이다. 동반 출현도 1,243 × C(6,2)=15 = 18,645번 더하기면 끝난다.

구간 분포는 기존 `sectorRanges`(6등분)와 별개로 **5구간(1~10 … 41~45)**을 쓴다 — 유저가 적은
구간 기준이고, 사람들이 실제로 그렇게 나눠 본다. 엔진의 6등분은 가중치 계산용으로 그대로 둔다.

## 파일

**새로**

| 파일 | 하는 일 |
|---|---|
| `src/features/backtest/drawCache.ts` | 회차 데이터 폰 저장 + 증분 수신 |
| `src/features/analysis/historyStats.ts` | 위 집계 함수들 |
| `src/features/analysis/historyStats.test.ts` | 손으로 만든 회차로 검산 |
| `src/features/analysis/useAnalysisSetups.ts` | 내 설정 저장 (zustand persist) |
| `src/features/analysis/components/NumberHeatGrid.tsx` | 번호판 45개 + 상세 |
| `src/features/analysis/components/DistributionPanel.tsx` | 조합 특성 분포 7종 |
| `src/features/analysis/components/CandidatePanel.tsx` | 가중치 칩 + 후보 + 고정/제외 |
| `src/features/analysis/components/ComboPanel.tsx` | 필터 + 통과 수 + 생성 |
| `app/(tabs)/more/lab.tsx` | 화면 본체 (칩 3개로 칸 전환) |

**수정**

| 파일 | 고치는 것 |
|---|---|
| `src/features/backtest/api/backtestDrawsApi.ts` | 폰 저장 경유하도록 |
| `app/(tabs)/more/_layout.tsx` | `Stack.Screen name="lab"` 한 줄 (빠뜨리면 제목이 "lab"으로 뜬다) |
| `app/(tabs)/more/index.tsx` | 메뉴 한 줄 |
| `src/features/generator/sourceLabel.ts` | 분석실 출처 라벨 하나 |

재사용(손대지 않음): `backtest/recipes.ts`(점수·후보·필터·생성), `backtest/pascal.ts`(조합 수),
`backtest/gaussian.ts`(합계 분포), `backtest/types.ts`, `mylotto/useMyLottoTickets.ts`,
`generator/recordGeneratedTickets.ts`.

## 배포

**OTA로 나간다.** 네이티브 의존성을 추가하지 않는다(그래서 슬라이더를 안 쓴다).
`runtimeVersion` 손대지 않는다. `npm run ota -- "번호 분석실"`.

처음에는 `more/index.tsx`의 `adminOnly: true`로 올려 실제 기기에서 확인한 뒤 그 한 줄을 지워
공개할 수 있다(스피또에서 쓴 방식).

## 검증

- `historyStats.test.ts` — 손으로 답을 아는 회차 3~5건을 넣어 동반 출현 횟수, 간격 평균,
  이월수, 연속번호 개수를 직접 계산한 값과 맞춰본다. 내가 쓴 코드의 출력을 근거로 삼기 전에
  검산한다(2026-10-27 교훈).
- `npx tsc --noEmit -p .`
- 폰(또는 에뮬레이터)에서: 비행기 모드로 켜서 저장분만으로 분석이 도는지, 고정/제외가
  점수를 이기는지, 후보가 6개 미만일 때 생성이 막히는지.

## 안 만드는 것

- 백테스트 비교표·순위표·학습/검증 구간·유의성 검정 (위 "왜 안 붙이나")
- "과거에 사봤다면" 체험 — '놓친 당첨금' 화면이 이미 그 자리에 있다
- 서버 저장·공유·남의 설정 보기
- 조합 분석 ⑫(과거 당첨 조합과 하나하나 대조) — 814만 조합 대조는 폰에서 느리고, 과거에 나온
  조합을 피하는 것이 유저에게 주는 값이 불분명하다. 요청이 오면 그때 넣는다.
