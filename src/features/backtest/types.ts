// 유저가 조합한 분석법(레시피)을 과거 회차에 적용해 성능을 재는 백테스트 엔진의 타입.
//
// 이 폴더 전체는 React/Expo는 물론 이 저장소의 다른 파일도 import하지 않는 순수 TypeScript다.
// 앱 화면, 배치 스크립트, 스레드 자동화 어디서든 같은 코드가 같은 결과를 내야 하기 때문이다.
//
// 이 엔진은 당첨을 예측하지 않는다. "이 분석법이 과거 데이터에서 무작위와 다른 결과를 냈는가"만
// 측정한다. 로또 추첨은 회차마다 독립이므로 어떤 분석법도 다음 회차 확률을 바꾸지 못한다.

export interface LottoDraw {
  round: number;
  drawDate?: string;
  /** 당첨번호. rule.pickCount개. */
  numbers: number[];
  bonus?: number;
  /** 일본 Lotto 6의 세트구(A~J). 한국 6/45에는 없다. */
  setBall?: string;
  /**
   * 그 회차 1인당 당첨금(원). 1~3등만 둔다 - 당첨자 수로 나누는 등수라 회차마다 다르다.
   * 4·5등은 법으로 금액이 정해져 있어 회차 데이터가 아니라 상수다(replay.ts FIXED_PRIZE).
   */
  prizePerWin?: Partial<Record<1 | 2 | 3, number>>;
}

export interface LottoRule {
  maxNumber: number;
  pickCount: number;
  bonusEnabled: boolean;
  setBallEnabled: boolean;
  setBallNames?: string[];
}

export const KOREA_LOTTO_6_45: LottoRule = {
  maxNumber: 45,
  pickCount: 6,
  bonusEnabled: true,
  setBallEnabled: false,
};

export const JAPAN_LOTTO_6: LottoRule = {
  maxNumber: 43,
  pickCount: 6,
  bonusEnabled: true,
  setBallEnabled: true,
  setBallNames: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
};

export type Rng = () => number;

// ---------- 필터 ----------

/**
 * 조합 필터. 값을 주지 않은 항목은 꺼진 것으로 본다.
 * 어떤 필터도 당첨 확률을 높이지 않는다 - 조합의 모양을 고를 뿐이다.
 */
export interface FilterConfig {
  /** 허용할 [홀, 짝] 조합. 예: [[3,3],[4,2]] */
  oddEven?: [number, number][];
  /** 허용할 [저, 고] 조합. 저는 maxNumber의 절반 이하. */
  lowHigh?: [number, number][];
  /** 합계 허용 범위 [최소, 최대]. */
  sumRange?: [number, number];
  /** 연속번호 최대 길이. 2면 3연속부터 탈락. */
  maxConsecutive?: number;
  /** 같은 끝수(1의 자리)를 몇 개까지 허용할지. 2면 끝수가 같은 번호 3개부터 탈락. */
  maxSameEndingDigit?: number;
  /** 직전 회차 당첨번호와 겹치는 개수의 허용 범위 [최소, 최대]. */
  previousDrawOverlap?: [number, number];
  /**
   * 정렬한 번호의 인접 간격 5개 중 피보나치 수(1,2,3,5,8,13,21,34)여야 하는 최소 개수.
   * 조합의 모양을 고르는 조건이며, 간격이 수열을 따라도 당첨 확률은 달라지지 않는다.
   */
  minFibonacciGaps?: number;
}

// ---------- 레시피 ----------

/**
 * 후보 점수를 만드는 요소별 가중치. 0이면 그 요소를 쓰지 않는다.
 * 전부 0이면 점수 차이가 없어 후보 압축이 무의미해지고, 사실상 무작위가 된다.
 */
export interface RecipeWeights {
  /** 전체 기간 출현 횟수가 많을수록 높은 점수. */
  totalFrequency: number;
  /** 최근 구간(recentWindow) 출현 횟수가 많을수록 높은 점수. */
  recentFrequency: number;
  /** 오래 안 나왔을수록 높은 점수. */
  gap: number;
  /**
   * 번호를 6구간으로 나눴을 때, 최근 구간에서 기대보다 덜 나온 구간일수록 높은 점수.
   * 같은 구간의 번호는 모두 같은 점수를 받는다 - 번호가 아니라 구간을 고르는 요소다.
   */
  sectorBalance: number;
  /**
   * 피보나치 수(1,2,3,5,8,13,21,34)에 가까울수록 높은 점수. 과거 회차와 무관하게
   * 번호 자체로 정해지는 값이다 - 추첨 결과가 수열을 따른다는 근거는 없다.
   */
  fibonacciAffinity: number;
  /**
   * 나머지 그룹(n mod 5)이 최근에 기대보다 덜 나왔을수록 높은 점수.
   * sectorBalance와 셈은 같고 묶는 기준만 구간 대신 나머지다.
   */
  modBalance: number;
  /**
   * 오일러 파이 함수 비율 φ(n)/n이 높을수록(= 서로소를 많이 가진 수일수록) 높은 점수.
   * 번호 자체로 정해지는 값이며, 서로소인 번호가 더 잘 나온다는 근거는 없다.
   */
  totient: number;
  /**
   * 출현 횟수가 이론 기대치에 가까울수록(표준점수 |z|가 0에 가까울수록) 높은 점수.
   * 많이 나온 번호도 덜 나온 번호도 아닌 "표본 변동 범위 안의 번호"를 고르는 것이며,
   * 그런 번호가 다음에 나올 확률이 높다는 뜻은 아니다.
   */
  frequencyTypicality: number;
  /** 같은 그룹이었던 과거 회차에서의 출현 횟수. grouping이 있어야 의미가 있다. */
  groupFrequency: number;
  /** 같은 그룹 안에서 오래 안 나왔을수록 높은 점수. */
  groupGap: number;
}

export const ZERO_WEIGHTS: RecipeWeights = {
  totalFrequency: 0,
  recentFrequency: 0,
  gap: 0,
  sectorBalance: 0,
  fibonacciAffinity: 0,
  modBalance: 0,
  totient: 0,
  frequencyTypicality: 0,
  groupFrequency: 0,
  groupGap: 0,
};

/**
 * 오우치식의 "같은 조건이었던 과거만 골라 본다"를 한국 로또에 옮긴 것.
 *
 * 일본 Lotto 6은 볼세트 10개(A~J)를 돌려 쓰고, 오우치는 다음에 쓸 세트를 예측한 뒤 그 세트에서
 * 나온 번호만 분석한다. 한국은 어느 세트를 썼는지 공개하지 않아 그 열을 그대로 쓸 수 없다.
 * 대신 회차를 일정 주기로 끊어 같은 자리를 한 그룹으로 본다 - 세트가 순환한다는 구조만 옮긴
 * 것이며, 물리적 근거가 있는 대체물은 아니다.
 */
export interface GroupingConfig {
  kind: "round-cycle";
  /** 몇 개 그룹으로 돌릴지. 일본 볼세트 수에 맞추면 10. */
  groupCount: number;
}

export type CombinationSelection =
  /** 후보에서 무작위로 뽑는다. 후보가 많아도 빠르다. */
  | "random"
  /** 후보의 모든 조합을 만들어 필터를 통과한 것 중 점수 높은 순으로 고른다. 후보 수 제한이 있다. */
  | "top-score";

export interface Recipe {
  id: string;
  name: string;
  weights: RecipeWeights;
  /** "최근"을 몇 회차로 볼지. */
  recentWindow: number;
  /** 점수 상위 몇 개를 후보로 남길지. rule.maxNumber와 같으면 압축하지 않는 것이다. */
  candidateCount: number;
  /**
   * 한 구간(6등분)에서 후보로 뽑을 수 있는 최대 개수. 주지 않으면 제한 없음.
   * 점수 상위만 자르면 후보가 한쪽 구간에 몰릴 수 있어, 구간을 고르게 쓰고 싶을 때 쓴다.
   */
  sectorCap?: number;
  /**
   * 한 나머지 그룹(n mod 5)에서 후보로 뽑을 수 있는 최대 개수. sectorCap과 같은 구실을 하며,
   * 묶는 기준만 다르다. 둘을 같이 주면 sectorCap을 쓴다.
   */
  modGroupCap?: number;
  grouping?: GroupingConfig;
  filters: FilterConfig;
  selection: CombinationSelection;
}

/** top-score 방식이 조합을 전수 생성해도 괜찮은 후보 수 상한. C(24,6) = 134,596. */
export const MAX_ENUMERABLE_CANDIDATES = 24;

// ---------- 전략 ----------

/**
 * 전략에 넘어가는 모든 것. history는 엔진이 대상 회차 "이전"까지만 잘라서 넘기므로,
 * 전략 구현이 실수로든 고의로든 정답을 볼 방법이 없다 - 누수를 규칙이 아니라 구조로 막는다.
 */
export interface StrategyContext {
  readonly history: readonly LottoDraw[];
  readonly rule: LottoRule;
  readonly rng: Rng;
  readonly ticketCount: number;
  /** 대상 회차 번호. 그룹 계산에만 쓴다 - 당첨번호는 들어있지 않다. */
  readonly targetRound: number;
}

export interface Strategy {
  id: string;
  name: string;
  /** 정확히 ticketCount개의 조합을 돌려준다. 엔진이 개수를 검사한다. */
  generate(context: StrategyContext): number[][];
}

// ---------- 결과 ----------

export interface RoundResult {
  round: number;
  /** 티켓별 맞은 개수. 길이는 ticketCount. */
  matches: number[];
  bestMatch: number;
  averageMatch: number;
}

export interface BacktestResult {
  strategyId: string;
  strategyName: string;
  drawsTested: number;
  ticketsPerDraw: number;
  totalTickets: number;
  /** matchCounts[k] = k개 맞은 티켓 수. 길이는 pickCount + 1. */
  matchCounts: number[];
  averageMatches: number;
  atLeast3: number;
  atLeast4: number;
  atLeast5: number;
  jackpot: number;
  /** 보너스까지 반영한 등수별 티켓 수. */
  rankCounts: Record<1 | 2 | 3 | 4 | 5, number>;
  perRound: RoundResult[];
}

export interface DataIssue {
  kind:
    | "duplicate-round"
    | "missing-round"
    | "bad-number-count"
    | "duplicate-number"
    | "out-of-range"
    | "bad-bonus"
    | "bad-set-ball";
  round: number | null;
  detail: string;
}

export interface BacktestOptions {
  rule: LottoRule;
  /** 회차마다 만들 조합 수. 모든 전략에 똑같이 적용된다. */
  ticketCount: number;
  /** 이만큼 과거 데이터가 쌓인 뒤부터 테스트한다. */
  minimumHistory: number;
  fromRound?: number;
  toRound?: number;
  seed: string;
}

export const DEFAULT_OPTIONS: Omit<BacktestOptions, "rule"> = {
  ticketCount: 10,
  minimumHistory: 100,
  seed: "backtest-v1",
};

/** 재현에 필요한 정보. 결과와 함께 저장/export한다. */
export interface BacktestRunMeta {
  algorithmVersion: string;
  dataRange: { from: number; to: number; count: number };
  testRange: { from: number; to: number };
  options: BacktestOptions;
  recipes: Recipe[];
  executedAt: string;
}

export const ALGORITHM_VERSION = "2.0.0";
