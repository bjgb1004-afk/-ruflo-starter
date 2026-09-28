import {
  GENIUSES,
  comboKey,
  generateGeniusGames,
  generateExtraGames,
  generateStoreGame,
  geniusOfToday,
  passesCommonFilters,
  upcomingDrawNo,
  type GeniusId,
} from "./geniusGenerator";
import { PI_DIGITS, E_DIGITS } from "./mathDigits";

// gzclab-threads/test_lotto_gen.py의 GOLDEN과 같은 값. 이게 깨지면 스레드에 올라간 번호와
// 앱 번호가 갈라진 것이다 - 한쪽만 고치지 말 것.
const GOLDEN: Record<string, Record<string, number[] | number[][]>> = {
  "1244": {
    "archimedes": [
      [
        3,
        18,
        19,
        27,
        30,
        38
      ],
      [
        1,
        24,
        25,
        29,
        38,
        41
      ],
      [
        6,
        9,
        11,
        31,
        37,
        39
      ],
      [
        1,
        4,
        11,
        12,
        39,
        40
      ],
      [
        10,
        18,
        19,
        35,
        37,
        42
      ]
    ],
    "fibonacci": [
      [
        4,
        8,
        14,
        25,
        32,
        42
      ],
      [
        5,
        15,
        22,
        33,
        39,
        43
      ],
      [
        3,
        14,
        21,
        25,
        31,
        42
      ],
      [
        6,
        16,
        23,
        34,
        40,
        44
      ],
      [
        4,
        10,
        14,
        21,
        31,
        38
      ]
    ],
    "pascal": [
      [
        1,
        4,
        7,
        19,
        34,
        40
      ],
      [
        1,
        10,
        11,
        19,
        31,
        37
      ],
      [
        4,
        10,
        16,
        19,
        31,
        37
      ],
      [
        1,
        10,
        13,
        19,
        28,
        31
      ],
      [
        4,
        19,
        22,
        28,
        37,
        40
      ]
    ],
    "euler": [
      [
        7,
        19,
        21,
        33,
        34,
        43
      ],
      [
        3,
        5,
        15,
        23,
        24,
        32
      ],
      [
        3,
        4,
        9,
        19,
        35,
        39
      ],
      [
        3,
        7,
        16,
        22,
        29,
        44
      ],
      [
        7,
        12,
        13,
        17,
        20,
        41
      ]
    ],
    "gauss": [
      [
        8,
        14,
        24,
        25,
        32,
        35
      ],
      [
        6,
        15,
        18,
        22,
        37,
        40
      ],
      [
        4,
        9,
        15,
        31,
        36,
        43
      ],
      [
        5,
        18,
        21,
        27,
        31,
        36
      ],
      [
        7,
        8,
        14,
        30,
        36,
        43
      ]
    ],
    "store:서울 노원구": [
      9,
      12,
      17,
      21,
      28,
      30
    ]
  },
  "1300": {
    "archimedes": [
      [
        2,
        3,
        6,
        34,
        38,
        44
      ],
      [
        14,
        18,
        20,
        25,
        28,
        44
      ],
      [
        4,
        8,
        13,
        24,
        33,
        34
      ],
      [
        5,
        10,
        17,
        34,
        39,
        45
      ],
      [
        5,
        6,
        14,
        36,
        38,
        40
      ]
    ],
    "fibonacci": [
      [
        6,
        13,
        23,
        30,
        34,
        40
      ],
      [
        2,
        13,
        19,
        30,
        36,
        40
      ],
      [
        8,
        14,
        18,
        25,
        35,
        42
      ],
      [
        10,
        16,
        20,
        27,
        37,
        44
      ],
      [
        2,
        13,
        20,
        30,
        37,
        41
      ]
    ],
    "pascal": [
      [
        9,
        11,
        21,
        26,
        36,
        44
      ],
      [
        1,
        4,
        19,
        28,
        31,
        37
      ],
      [
        1,
        10,
        19,
        29,
        37,
        39
      ],
      [
        1,
        19,
        22,
        28,
        31,
        37
      ],
      [
        4,
        13,
        17,
        27,
        36,
        44
      ]
    ],
    "euler": [
      [
        4,
        12,
        18,
        23,
        36,
        38
      ],
      [
        1,
        3,
        30,
        33,
        37,
        43
      ],
      [
        7,
        13,
        16,
        23,
        36,
        38
      ],
      [
        6,
        12,
        14,
        17,
        19,
        37
      ],
      [
        13,
        16,
        26,
        33,
        36,
        39
      ]
    ],
    "gauss": [
      [
        13,
        15,
        16,
        23,
        32,
        39
      ],
      [
        6,
        7,
        20,
        29,
        36,
        40
      ],
      [
        6,
        13,
        24,
        26,
        33,
        36
      ],
      [
        14,
        16,
        17,
        19,
        29,
        43
      ],
      [
        5,
        7,
        21,
        30,
        33,
        41
      ]
    ],
    "store:서울 노원구": [
      3,
      6,
      15,
      17,
      34,
      44
    ]
  }
};

describe("parity with the Threads automation", () => {
  it("matches the shared golden values", () => {
    for (const [draw, sets] of Object.entries(GOLDEN)) {
      for (const [key, expected] of Object.entries(sets)) {
        const actual = key.startsWith("store:")
          ? generateStoreGame(key.slice(6), Number(draw))
          : generateGeniusGames(key as GeniusId, Number(draw));
        expect(actual).toEqual(expected);
      }
    }
  });
});

describe("generateExtraGames", () => {
  it("never repeats a combo across rounds and stays valid", () => {
    for (const g of GENIUSES) {
      const seen = new Set(generateGeniusGames(g.id, 1244).map(comboKey));
      for (let round = 1; round <= 10; round++) {
        const games = generateExtraGames(g.id, 1244, round);
        expect(games).toHaveLength(5);
        expect(games.every(passesCommonFilters)).toBe(true);
        for (const key of games.map(comboKey)) {
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
  });
  it("gives the same numbers for the same round", () => {
    expect(generateExtraGames("euler", 1244, 3)).toEqual(generateExtraGames("euler", 1244, 3));
  });
});

describe("mathDigits", () => {
  it("holds the first 5,000 decimals of π and e", () => {
    expect(PI_DIGITS).toHaveLength(5000);
    expect(E_DIGITS).toHaveLength(5000);
    expect(PI_DIGITS.startsWith("14159265358979323846")).toBe(true);
    expect(E_DIGITS.startsWith("71828182845904523536")).toBe(true);
    expect(PI_DIGITS.slice(761, 767)).toBe("999999"); // Feynman point
  });
});

describe("draw and weekday helpers", () => {
  it("moves to the next draw once the Saturday 20:45 draw has passed", () => {
    expect(upcomingDrawNo(new Date("2002-12-01T00:00:00+09:00"))).toBe(1);
    expect(upcomingDrawNo(new Date("2022-01-29T20:44:00+09:00"))).toBe(1000);
    expect(upcomingDrawNo(new Date("2022-01-29T20:46:00+09:00"))).toBe(1001);
    expect(upcomingDrawNo(new Date("2026-09-28T17:07:00+09:00"))).toBe(1244);
  });
  it("assigns one genius per weekday in Korean time", () => {
    expect(geniusOfToday(new Date("2026-09-28T01:00:00+09:00"))?.id).toBe("archimedes"); // 월
    expect(geniusOfToday(new Date("2026-10-02T23:59:00+09:00"))?.id).toBe("gauss"); // 금
    expect(geniusOfToday(new Date("2026-10-03T12:00:00+09:00"))).toBeNull(); // 토
    expect(geniusOfToday(new Date("2026-10-04T12:00:00+09:00"))).toBeNull(); // 일
  });
});

describe("passesCommonFilters", () => {
  it("applies the sum, odd/even and run rules", () => {
    expect(passesCommonFilters([1, 3, 5, 8, 10, 12])).toBe(false);
    expect(passesCommonFilters([11, 15, 21, 25, 31, 35])).toBe(false);
    expect(passesCommonFilters([7, 20, 21, 22, 33, 40])).toBe(false);
    expect(passesCommonFilters([3, 14, 22, 27, 35, 41])).toBe(true);
  });
});

describe("generateGeniusGames", () => {
  it("returns five distinct valid games for every genius across many draws", () => {
    for (let draw = 1; draw < 2000; draw += 7) {
      for (const g of GENIUSES) {
        const games = generateGeniusGames(g.id, draw);
        expect(games).toHaveLength(5);
        expect(new Set(games.map(comboKey)).size).toBe(5);
        expect(games.every(passesCommonFilters)).toBe(true);
      }
    }
  });
  it("is stable within a draw and changes between draws", () => {
    expect(generateGeniusGames("gauss", 1244)).toEqual(generateGeniusGames("gauss", 1244));
    expect(generateGeniusGames("gauss", 1244)).not.toEqual(generateGeniusGames("gauss", 1245));
  });
});
