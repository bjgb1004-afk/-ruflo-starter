import {
  BANDS,
  GAMES_PER_SET,
  THREAD_MAX_CHARS,
  analyzeGame,
  checkBandGames,
  formatResultPost,
  formatThreadPost,
  generateBandGames,
  generateDailyBandGames,
  kstDateKey,
  satisfiesBandRules,
  seededRng,
} from "./bandGenerator";
import { computeWinRank } from "@/features/qr/checkWinnings";

describe("satisfiesBandRules", () => {
  it("빈 구간이 정확히 1개가 아니면 떨어뜨린다", () => {
    // 1-9, 10-19에만 몰려 빈 구간 3개
    expect(satisfiesBandRules([1, 2, 3, 11, 12, 13])).toBe(false);
    // 다섯 구간에 모두 들어가 빈 구간 0개
    expect(satisfiesBandRules([1, 2, 11, 21, 31, 41])).toBe(false);
  });

  it("한 구간에 4개 이상이면 떨어뜨린다", () => {
    // 20~29에 4개, 빈 구간은 1개(40~45)지만 구간 상한 초과
    expect(satisfiesBandRules([1, 21, 22, 23, 24, 31])).toBe(false);
  });

  it("저:고 비율이 2:4/3:3/4:2가 아니면 떨어뜨린다", () => {
    // 저 5 : 고 1, 빈 구간 1개(40~45), 구간당 3개 이하
    expect(satisfiesBandRules([1, 2, 11, 12, 21, 31])).toBe(false);
  });

  it("세 조건을 모두 만족하면 통과시킨다", () => {
    // 구간 1-1-2-1-1 (빈 구간 없음) → 아래는 빈 구간 1개짜리로
    const ok = [3, 12, 21, 22, 31, 33]; // 구간 1-1-2-2-0, 저 4 : 고 2
    expect(satisfiesBandRules(ok)).toBe(true);
  });

  it("중복·범위 이탈 번호를 거른다", () => {
    expect(satisfiesBandRules([3, 3, 21, 22, 31, 33])).toBe(false);
    expect(satisfiesBandRules([0, 12, 21, 22, 31, 33])).toBe(false);
    expect(satisfiesBandRules([3, 12, 21, 22, 31, 46])).toBe(false);
    expect(satisfiesBandRules([3, 12, 21, 22, 31])).toBe(false);
  });
});

describe("analyzeGame", () => {
  it("구간 분포와 저:고 비율을 계산한다", () => {
    const g = analyzeGame([33, 3, 22, 12, 31, 21]);
    expect(g.numbers).toEqual([3, 12, 21, 22, 31, 33]);
    expect(g.bandCounts).toEqual([1, 1, 2, 2, 0]);
    expect(g.bandPattern).toBe("1-1-2-2-0");
    // 저(1~22)는 3, 12, 21, 22 넷. 고(23~45)는 31, 33 둘.
    expect(g.lowCount).toBe(4);
    expect(g.highCount).toBe(2);
    expect(g.lowHighRatio).toBe("4:2");
  });

  it("구간 개수 합은 항상 6이다", () => {
    const g = analyzeGame([1, 9, 10, 40, 44, 45]);
    expect(g.bandCounts.reduce((s, c) => s + c, 0)).toBe(6);
    expect(g.bandCounts).toHaveLength(BANDS.length);
  });
});

describe("generateBandGames - 1만 게임 조건 검증", () => {
  it("2000세트(=1만 게임) 전부가 조건 1~3을 만족한다", () => {
    const SETS = 2000;
    let games = 0;

    for (let i = 0; i < SETS; i++) {
      const set = generateBandGames(seededRng(`verify|${i}`));
      expect(set).toHaveLength(GAMES_PER_SET);

      for (const game of set) {
        games += 1;

        // 조건 0: 1~45 중복 없는 6개, 오름차순
        expect(game.numbers).toHaveLength(6);
        expect(new Set(game.numbers).size).toBe(6);
        expect([...game.numbers].sort((a, b) => a - b)).toEqual(game.numbers);
        expect(game.numbers.every((n) => n >= 1 && n <= 45)).toBe(true);

        // 조건 1: 빈 구간이 정확히 1개
        expect(game.bandCounts.filter((c) => c === 0)).toHaveLength(1);

        // 조건 2: 한 구간 최대 3개
        expect(Math.max(...game.bandCounts)).toBeLessThanOrEqual(3);

        // 조건 3: 저:고 비율
        expect([2, 3, 4]).toContain(game.lowCount);
        expect(game.lowCount + game.highCount).toBe(6);

        // 규칙 함수와 생성 결과가 어긋나지 않는지 교차 확인
        expect(satisfiesBandRules(game.numbers)).toBe(true);
      }

      // 한 세트 안에서 같은 조합이 두 번 나오지 않는다
      const keys = set.map((g) => g.numbers.join(","));
      expect(new Set(keys).size).toBe(GAMES_PER_SET);
    }

    expect(games).toBe(10_000);
  });

  it("시드 없이 뽑아도 조건을 만족한다", () => {
    for (let i = 0; i < 200; i++) {
      for (const game of generateBandGames()) {
        expect(satisfiesBandRules(game.numbers)).toBe(true);
      }
    }
  });

  it("시드가 없으면 매번 다른 번호가 나온다", () => {
    const a = generateBandGames().map((g) => g.numbers.join(","));
    const b = generateBandGames().map((g) => g.numbers.join(","));
    expect(a).not.toEqual(b);
  });
});

describe("generateDailyBandGames", () => {
  it("같은 날짜면 항상 같은 5게임", () => {
    const a = generateDailyBandGames("2026-09-30");
    const b = generateDailyBandGames("2026-09-30");
    expect(a).toEqual(b);
  });

  it("날짜가 다르면 다른 번호", () => {
    const a = generateDailyBandGames("2026-09-30").map((g) => g.numbers.join(","));
    const b = generateDailyBandGames("2026-10-01").map((g) => g.numbers.join(","));
    expect(a).not.toEqual(b);
  });

  it("kstDateKey는 YYYY-MM-DD 형식", () => {
    expect(kstDateKey(new Date("2026-09-30T23:30:00Z"))).toBe("2026-10-01"); // KST는 +9시간
    expect(kstDateKey(new Date("2026-09-30T00:00:00Z"))).toBe("2026-09-30");
  });
});

describe("checkBandGames", () => {
  const games = [analyzeGame([3, 12, 21, 22, 31, 33])];

  it("맞은 개수와 등수를 계산한다", () => {
    expect(checkBandGames(games, [3, 12, 21, 22, 31, 33], 45)[0]).toMatchObject({ matchCount: 6, rank: 1 });
    expect(checkBandGames(games, [3, 12, 21, 22, 31, 44], 33)[0]).toMatchObject({ matchCount: 5, hasBonus: true, rank: 2 });
    expect(checkBandGames(games, [3, 12, 21, 22, 31, 44], 45)[0]).toMatchObject({ matchCount: 5, rank: 3 });
    expect(checkBandGames(games, [3, 12, 21, 22, 43, 44], 45)[0]).toMatchObject({ matchCount: 4, rank: 4 });
    expect(checkBandGames(games, [3, 12, 21, 42, 43, 44], 45)[0]).toMatchObject({ matchCount: 3, rank: 5 });
    expect(checkBandGames(games, [1, 2, 41, 42, 43, 44], 45)[0]).toMatchObject({ matchCount: 0, rank: null });
  });

  // 이 모듈은 다른 프로젝트에 복사해 쓰려고 등수 규칙을 자체 구현했다. 앱 쪽 정본과
  // 갈라지면 같은 티켓이 화면과 게시글에서 다른 등수로 보이므로 여기서 묶어둔다.
  it("앱의 computeWinRank와 등수가 일치한다", () => {
    const winning = [3, 12, 21, 22, 31, 44];
    for (const bonus of [33, 45]) {
      const mine = checkBandGames(games, winning, bonus)[0].rank;
      expect(mine).toBe(computeWinRank(games[0].numbers, winning, bonus));
    }
  });
});

describe("게시글 텍스트", () => {
  const games = generateDailyBandGames("2026-09-30");

  it("스레드 글은 500자를 넘지 않는다", () => {
    expect(formatThreadPost(games, { dateKey: "2026-09-30", drawNo: 1244 }).length).toBeLessThanOrEqual(
      THREAD_MAX_CHARS,
    );
    expect(formatThreadPost(games).length).toBeLessThanOrEqual(THREAD_MAX_CHARS);
  });

  it("스레드 글에 5게임과 해시태그가 들어간다", () => {
    const post = formatThreadPost(games, { drawNo: 1244 });
    expect(post).toContain("1244회");
    expect(post).toContain("#로또");
    for (const letter of ["A", "B", "C", "D", "E"]) {
      expect(post).toContain(`${letter} `);
    }
    expect(post).toContain(games[0].bandPattern);
  });

  it("결과 글도 500자를 넘지 않고 등수를 담는다", () => {
    const results = checkBandGames(games, games[0].numbers, 45);
    const post = formatResultPost(results, { drawNo: 1244, winningNumbers: games[0].numbers, bonusNumber: 45 });
    expect(post.length).toBeLessThanOrEqual(THREAD_MAX_CHARS);
    expect(post).toContain("1244회");
    expect(post).toContain("1등");
  });
});
