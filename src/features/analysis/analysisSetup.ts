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
 * 분석실에서 조절하는 가중치. 엔진의 RecipeWeights 중 과거 데이터로 정해지는 것만 쓴다.
 * 피보나치 근접·서로소 비율은 번호 자체로 정해지는 값이고 '천재들의 한수' 화면에
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

/** 후보 수를 고를 수 있는 범위. 상한은 comboPicker의 전수 열거 비용에 묶여 있다. */
export const CANDIDATE_MIN = 10;
export const CANDIDATE_MAX = 20;

export interface AnalysisSetup {
  id: string;
  name: string;
  savedAt: string;
  /** 구간. ALL_ROUNDS(0)면 전체. */
  span: number;
  weights: Record<LabWeightKey, number>;
  /** 후보로 남길 개수. CANDIDATE_MIN ~ CANDIDATE_MAX. */
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
