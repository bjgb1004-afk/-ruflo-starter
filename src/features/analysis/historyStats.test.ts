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

// 손으로 답을 셀 수 있는 4회차. 기대값은 전부 아래 주석대로 직접 센 것이다.
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
    // 1번의 동반: 2가 3회, 3이 2회, 나머지(4·5·10·11·20·21·30·31·41·45)가 1회씩
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
    // [1,2,11,21,31,41] - 끝수 1이 다섯 개(1·11·21·31·41), 끝수 2가 하나
    expect(shapeOf(DRAWS[1], RULE).maxSameEnding).toBe(5);
  });

  it("번호대 분포를 센다", () => {
    // [1,2,3,10,20,30] - 1·2·3·10이 1~10, 20이 11~20, 30이 21~30
    expect(shapeOf(DRAWS[0], RULE).bands).toEqual([4, 1, 1, 0, 0]);
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
    // 66, 107, 159, 60 -> 합 392
    expect(dist.sumMin).toBe(60);
    expect(dist.sumMax).toBe(159);
    expect(dist.sumMean).toBeCloseTo(98, 5);
  });

  it("홀수 개수별 회차 수", () => {
    // 홀수 개수 - 1회차 2개, 2회차 5개, 3회차 5개, 4회차 4개
    expect(dist.oddCounts).toHaveLength(RULE.pickCount + 1);
    expect(dist.oddCounts[2]).toBe(1);
    expect(dist.oddCounts[4]).toBe(1);
    expect(dist.oddCounts[5]).toBe(2);
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
