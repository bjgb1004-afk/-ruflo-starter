// 번호 생성 방식들을 과거 회차에 적용해 성능을 비교하는 백테스트 엔진의 타입.
//
// 이 폴더 전체는 React/Expo는 물론 이 저장소의 다른 파일도 import하지 않는 순수 TypeScript다.
// 앱 화면, 배치 스크립트, 스레드 자동화 어디서든 같은 코드를 돌려 같은 결과를 얻기 위해서다.
//
// 이 엔진은 당첨을 예측하지 않는다. "과거 데이터에서 이 방식이 무작위와 다른 결과를 냈는가"만
// 측정한다. 로또 추첨은 회차마다 독립이므로 어떤 방식도 다음 회차 확률을 바꾸지 못한다.

export interface LottoDraw {
  round: number;
  drawDate?: string;
  /** 당첨번호. rule.pickCount개. */
  numbers: number[];
  bonus?: number;
  /** 일본 Lotto 6의 세트구(A~J). 한국 6/45에는 없다. */
  setBall?: string;
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

/** 조합 생성 필터. 값을 주지 않은 항목은 꺼진 것으로 본다(스펙 11장: 모든 필터는 켜고 끌 수 있다). */
export interface FilterConfig {
  /** 허용할 [홀, 짝] 조합. 예: [[3,3],[4,2]] */
  oddEven?: [number, number][];
  /** 허용할 [저, 고] 조합. 저는 maxNumber의 절반 이하. */
  lowHigh?: [number, number][];
  /** 합계 허용 범위 [최소, 최대]. */
  sumRange?: [number, number];
  /** 연속번호 최대 길이. 2면 3연속부터 탈락. */
  maxConsecutive?: number;
}

export interface StrategyParams {
  /** 최근 빈도를 볼 구간들. 예: [5, 10, 20, 50, 100] */
  recentWindows: number[];
  weights: {
    frequency: number;
    recent: number;
    gap: number;
  };
  /** 상위 몇 개를 후보로 압축할지(스펙 10장). rule.pickCount보다 커야 한다. */
  candidateCount: number;
  filters: FilterConfig;
}

export const DEFAULT_PARAMS: StrategyParams = {
  recentWindows: [5, 10, 20, 50, 100],
  weights: { frequency: 0.4, recent: 0.3, gap: 0.3 },
  candidateCount: 18,
  filters: {},
};

/**
 * 전략에 넘어가는 모든 것. history는 엔진이 대상 회차 "이전"까지만 잘라서 넘기므로,
 * 전략 구현이 실수로든 고의로든 정답을 볼 방법이 없다 - 누수 방지를 규칙이 아니라 구조로 막는다.
 */
export interface StrategyContext {
  readonly history: readonly LottoDraw[];
  readonly rule: LottoRule;
  readonly rng: Rng;
  readonly ticketCount: number;
  readonly params: StrategyParams;
}

export interface Strategy {
  id: string;
  name: string;
  /** 정확히 ticketCount개의 조합을 돌려준다. 엔진이 개수를 검사한다. */
  generate(context: StrategyContext): number[][];
}

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
  /** 보너스까지 반영한 등수별 티켓 수. 1~5등만 센다. */
  rankCounts: Record<1 | 2 | 3 | 4 | 5, number>;
  perRound: RoundResult[];
}

export interface DataIssue {
  kind: "duplicate-round" | "missing-round" | "bad-number-count" | "duplicate-number" | "out-of-range" | "bad-bonus" | "bad-set-ball";
  round: number | null;
  detail: string;
}

export interface BacktestOptions {
  rule: LottoRule;
  /** 회차마다 만들 조합 수. 모든 전략에 똑같이 적용된다(스펙 13장). */
  ticketCount: number;
  /** 이만큼 과거 데이터가 쌓인 뒤부터 테스트한다. */
  minimumHistory: number;
  /** 테스트 시작/종료 회차. 생략하면 가능한 전 구간. */
  fromRound?: number;
  toRound?: number;
  seed: string;
  params: StrategyParams;
}

export const DEFAULT_OPTIONS: Omit<BacktestOptions, "rule"> = {
  ticketCount: 10,
  minimumHistory: 100,
  seed: "backtest-v1",
  params: DEFAULT_PARAMS,
};

/** 재현에 필요한 정보(스펙 19장). 결과와 함께 저장/export한다. */
export interface BacktestRunMeta {
  algorithmVersion: string;
  dataRange: { from: number; to: number; count: number };
  testRange: { from: number; to: number };
  options: BacktestOptions;
  executedAt: string;
}

export const ALGORITHM_VERSION = "1.0.0";
