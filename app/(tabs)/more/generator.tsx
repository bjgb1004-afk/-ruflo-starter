import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View, Text, Pressable, StyleSheet, Share, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { LottoBall } from "@/components/LottoBall";
import { useAuth } from "@/features/auth/useAuth";
import { ADMIN_EMAILS } from "@/constants/config";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";
import { useResponsive, getResponsiveFontSize } from "@/utils/responsive";
import { upcomingDrawNo } from "@/features/generator/geniusGenerator";
import {
  comboKey,
  formatThreadPost,
  GAMES_PER_SET,
  generateBandGames,
  generateDailyBandGames,
  kstDateKey,
  type BandGame,
} from "@/features/generator/bandGenerator";
import { useMyLottoTickets } from "@/features/mylotto/useMyLottoTickets";
import { AdBanner } from "@/features/ads/AdBanner";
import { needsAdForDraw, requestDraw, type DrawPermission } from "@/features/generator/requestDraw";
import { useDrawCredits } from "@/features/generator/useDrawCredits";
import { BAND_SOURCE, mathSource, recordGeneratedTickets } from "@/features/generator/recordGeneratedTickets";
import { getLiveGeneratedStats } from "@/features/generator/api/liveGeneratedApi";
import { Scoreboard } from "@/features/generator/components/Scoreboard";
import { MATH_CHIPS, sourceLabel } from "@/features/generator/sourceLabel";
import { getDrawsForBacktest } from "@/features/backtest/api/backtestDrawsApi";
import {
  ARCHIMEDES_RECIPE,
  EULER_RECIPE,
  FIBONACCI_RECIPE,
  GAUSSIAN_RECIPE,
  MOD_GROUP_DIVISOR,
  PASCAL_RECIPE,
  analyzeWithRecipe,
  modGroupOf,
  recipeStrategy,
  sectorIndexOf,
  sectorRanges,
} from "@/features/backtest/recipes";
import { sumDistribution, sumZScore } from "@/features/backtest/gaussian";
import {
  combinations,
  countCombinationsByShape,
  countPassingCombinations,
  measureCandidateHits,
  totalCombinations,
} from "@/features/backtest/pascal";
import { seededRng } from "@/features/backtest/engine";
import { KOREA_LOTTO_6_45 } from "@/features/backtest/types";

// 광고를 봐야 하는 버튼인지에 따라 문구가 달라진다. 유저가 누르기 전에 알아야 한다 -
// 누르고 나서 광고가 뜨면 속은 기분이 든다(AdMob 정책도 유저가 고르게 하라고 요구한다).
function drawButtonLabel(base: string, needsAd: boolean): string {
  return needsAd ? `광고 보고 ${base}` : base;
}

// 뽑은 뒤에 한 번만 알려줄 말. 공짜로 뽑은 경우엔 아무 말도 안 한다.
function drawNotice(permission: DrawPermission): string | null {
  if (permission === "rewarded") return "고마워요! 앞으로 5분은 광고 없이 마음껏 뽑을 수 있어요.";
  if (permission === "ad-unavailable") return "지금은 보여드릴 광고가 없어서 한 번 그냥 드려요.";
  return null;
}

type Mode = "band" | "analysis";

// 탭이 한 줄에 들어가야 한다. 분석법 이름(아르키메데스·피보나치)은 탭이 아니라 탭 안의
// 칩으로 고른다 - 분석법이 늘어도 탭 줄이 밀리지 않는다.
const MODES: readonly { id: Mode; label: string }[] = [
  { id: "analysis", label: "천재들의 한수" },
  { id: "band", label: "번호대 분석" },
];

export default function GeneratorScreen() {
  const { breakpoint } = useResponsive();
  // 제스처바가 있는 기기에서는 마지막 줄이 그 뒤로 들어가 안 읽힌다.
  const insets = useSafeAreaInsets();
  const drawNo = useMemo(() => upcomingDrawNo(), []);
  const [mode, setMode] = useState<Mode>("analysis");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
    >
      <Scoreboard />

      <View style={styles.tabs}>
        {MODES.map((m) => {
          const active = m.id === mode;
          return (
            <Pressable
              key={m.id}
              onPress={() => setMode(m.id)}
              style={[styles.tab, active && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === "band" && <BandSection drawNo={drawNo} breakpoint={breakpoint} />}
      {mode === "analysis" && <AnalysisSection drawNo={drawNo} breakpoint={breakpoint} />}
    </ScrollView>
  );
}

// ---------- 지금 인기 ----------

const LIVE_ROW_LIMIT = 5;

// 아직 추첨 전인 이번 회차에 지금까지 나간 번호를 코너별로 보여준다. Scoreboard와 달리
// 추첨 전이라 등수·당첨금이 없다 - "많이 나온 순서"일 뿐 당첨 확률과는 상관없다는 점을
// 고지문에 꼭 넣어야 한다("확률이 높다"로 읽히면 geniusGenerator.ts의 원칙과 어긋난다).
function LivePopularity({ drawNo }: { drawNo: number }) {
  // 아직 다듬는 중이라 관리자 계정에만 먼저 보여준다 - 일반 유저는 그대로 둔다.
  // 전체 공개할 준비가 되면 이 체크만 지우면 된다.
  const user = useAuth((s) => s.user);
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);
  const { data } = useQuery({
    queryKey: ["generator", "live-popularity", drawNo],
    queryFn: () => getLiveGeneratedStats(drawNo),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    enabled: isAdmin,
  });
  const rows = useMemo(
    () => (data?.bySource ?? []).filter((s) => s.games > 0).sort((a, b) => b.games - a.games),
    [data],
  );
  if (!isAdmin || rows.length === 0) return null;
  const shown = rows.slice(0, LIVE_ROW_LIMIT);
  const hidden = rows.length - shown.length;

  return (
    <View style={styles.scoreCard}>
      <Text style={styles.scoreTitle}>{drawNo}회 지금 인기 (추첨 전)</Text>
      <Text style={styles.subtitle}>지금까지 나간 번호 {data!.total.toLocaleString("ko-KR")}게임</Text>
      {shown.map((row, i) => (
        <View key={row.source} style={styles.sourceRow}>
          <Text style={styles.sourceName} numberOfLines={1}>
            {i + 1}위 · {sourceLabel(row.source)}
          </Text>
          <Text style={styles.sourceValue}>{row.games.toLocaleString("ko-KR")}게임</Text>
        </View>
      ))}
      {hidden > 0 && <Text style={styles.subtitle}>외 {hidden}개 코너</Text>}
      <Text style={styles.disclaimer}>지금 인기 순위예요 · 당첨 확률은 어떤 코너나 똑같아요.</Text>
    </View>
  );
}

// ---------- 번호대 분석 ----------

// 첫 화면은 날짜 시드로 뽑은 "오늘의 추천" - 스레드에 올라간 번호와 같다. "다시 뽑기"를
// 누르면 시드 없이 완전 무작위로 바뀌어 그 사람만의 번호가 된다.
function BandSection({ drawNo, breakpoint }: { drawNo: number; breakpoint: "small" | "medium" | "large" }) {
  const dateKey = useMemo(() => kstDateKey(), []);
  const [games, setGames] = useState<BandGame[]>(() => generateDailyBandGames(dateKey));
  const [isToday, setIsToday] = useState(true);
  const addTickets = useMyLottoTickets((s) => s.addTickets);
  const credits = useDrawCredits();
  const [drawing, setDrawing] = useState(false);

  // 화면에 뜨는 모든 게임을 성적표 집계로 보낸다(오늘의 추천이든 다시 뽑기든) - 보관함에
  // 저장하는 사람만 세면 표본이 너무 적어진다. games는 다시 뽑아도 기존 게임을 그대로 쌓아가므로
  // 지금까지 보낸 개수를 기억해 두고 새로 늘어난 뒤쪽만 보낸다(안 그러면 이전 게임을 또 센다).
  const recordedCountRef = useRef(0);
  useEffect(() => {
    if (games.length <= recordedCountRef.current) return;
    const freshGames = games.slice(recordedCountRef.current);
    recordedCountRef.current = games.length;
    recordGeneratedTickets(BAND_SOURCE, drawNo, freshGames.map((g) => g.numbers));
  }, [games, drawNo]);

  const reroll = useCallback(async () => {
    if (drawing) return;
    setDrawing(true);
    try {
      const permission = await requestDraw(BAND_SOURCE, drawNo);
      setGames((prev) => {
        const exclude = new Set(prev.map((g) => comboKey(g.numbers)));
        return [...prev, ...generateBandGames(Math.random, GAMES_PER_SET, exclude)];
      });
      setIsToday(false);
      const notice = drawNotice(permission);
      if (notice) Alert.alert("5게임 더 뽑았어요", notice);
    } finally {
      setDrawing(false);
    }
  }, [drawing, drawNo]);

  const share = useCallback(async () => {
    await Share.share({ message: formatThreadPost(games, { drawNo }) });
  }, [games, drawNo]);

  const save = useCallback(() => {
    const added = addTickets(games.map((g) => ({ drawNo, numbers: g.numbers, purchaseType: null, purchased: false })));
    Alert.alert(
      added.length > 0 ? "보관함에 저장했어요" : "이미 보관함에 있어요",
      added.length > 0
        ? `${drawNo}회 ${added.length}게임을 보관함에 넣었어요. 추첨 후 자동으로 확인해 드려요.`
        : `${drawNo}회에 같은 번호가 이미 저장돼 있어요.`,
    );
  }, [addTickets, games, drawNo]);

  return (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { fontSize: getResponsiveFontSize(20, breakpoint) }]}>
          {drawNo}회 번호대 분석
        </Text>
        <Text style={styles.subtitle}>
          {isToday
            ? `오늘(${dateKey})의 추천 5게임이에요. 다시 뽑으면 5게임이 더 나와요.`
            : `지금까지 뽑은 ${games.length}게임이에요.`}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.method}>
          1~9 / 10~19 / 20~29 / 30~39 / 40~45 다섯 구간 중 한 구간은 비우고, 한 구간에 세 개까지만 담았어요. 저(1~22)와
          고(23~45)는 2:4, 3:3, 4:2 중 하나로 맞췄어요.
        </Text>
        {games.map((game, i) => (
          <View key={game.numbers.join(",")} style={styles.bandGame}>
            <View style={styles.gameRow}>
              <Text style={styles.letter}>{i + 1}</Text>
              <View style={styles.balls}>
                {game.numbers.map((n) => (
                  <LottoBall key={n} number={n} size="small" />
                ))}
              </View>
            </View>
            <Text style={styles.bandMeta}>
              구간 {game.bandPattern} · 저고 {game.lowHighRatio}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.primaryButton, drawing && styles.primaryButtonBusy]}
        onPress={reroll}
        disabled={drawing}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>
          {drawing ? "잠시만요…" : drawButtonLabel("다시 뽑기", needsAdForDraw(credits, BAND_SOURCE, drawNo))}
        </Text>
      </Pressable>
      <AdBanner />

      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={save} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>보관함에 저장</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={share} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>번호 보내기</Text>
        </Pressable>
      </View>

      <Text style={styles.disclaimer}>
        통계 참고용이며 당첨 확률을 높여주지 않습니다.
      </Text>
    </>
  );
}

// ---------- 천재들의 한수 (아르키메데스 / 피보나치) ----------

// 지난 회차 전체를 넣고 번호마다 점수를 매겨 45개에서 15개로 좁힌 뒤, 그 안에서 5게임을 만든다.
// 점수·후보·조합 모두 백테스트 엔진의 레시피를 그대로 쓴다 - 화면에 보이는 분석법과
// scripts/runBacktest.ts로 성적을 재는 분석법이 같은 코드여야 숫자를 정직하게 말할 수 있다.
// 분석법을 더 넣을 때도 레시피 하나와 아래 설명 한 덩어리만 추가하면 된다.
//
// 어떤 분석법도 당첨 확률을 바꾸지 않는다(모든 조합이 1/8,145,060). 화면에서 "확률이 높다"는
// 표현은 쓰지 않는다.
const RULE = KOREA_LOTTO_6_45;
const TICKETS_PER_ROUND = 5;

/** 정렬된 번호의 인접 간격. 피보나치 분석에서 "간격 3 · 5 · 2 · 8"로 보여준다. */
function gapsOf(numbers: readonly number[]): number[] {
  return numbers.slice(1).map((n, i) => n - numbers[i]);
}

interface AnalysisMethod {
  recipe: typeof ARCHIMEDES_RECIPE;
  chip: string;
  title: string;
  /** 후보를 어떤 묶음으로 보여줄지. 분석법이 번호를 묶는 기준과 같아야 한다. */
  grouping: "sector" | "mod5";
  /** 후보 카드 제목. */
  groupTitle: string;
  /** 점수를 어떻게 매겼는지. 가중치를 그대로 적는다. */
  score: string;
  /** 조합을 어떻게 걸렀는지. */
  combo: string;
  /** 번호 사이 간격을 게임마다 보여줄지(피보나치는 간격이 방법의 핵심이다). */
  showGaps?: boolean;
  /** 게임마다 합계와 표준점수를 보여줄지(가우시안은 합계가 방법의 핵심이다). */
  showSumZ?: boolean;
  /** 과거 회차 합계 분포를 이론값과 나란히 보여줄지. */
  showSumDistribution?: boolean;
  /** 하단 고지문. 확률을 높인다고 읽히지 않게 쓴다. */
  note: string;
}

const ANALYSIS_METHODS: readonly AnalysisMethod[] = [
  {
    recipe: ARCHIMEDES_RECIPE,
    chip: MATH_CHIPS[ARCHIMEDES_RECIPE.id],
    title: "아르키메데스 분석",
    grouping: "sector",
    groupTitle: "45개를 6구간으로 나눠서",
    score: "전체 출현 횟수 40%, 최근 100회 출현 횟수 30%, 안 나온 기간 20%, 구간 균형 10%",
    combo: "합계 100~175, 홀짝과 저(1~22):고(23~45) 모두 2:4 / 3:3 / 4:2, 3연속 번호 없음",
    note:
      "아르키메데스가 쓴 공식이 아니라, 그가 다룬 비례와 균형을 지난 회차 통계에 옮긴 분석이에요. " +
      "가중치 4:3:2:1은 정해 둔 값이고, 오래 안 나온 번호가 다음에 나올 확률이 높아지는 것도 아니에요.",
  },
  {
    recipe: PASCAL_RECIPE,
    chip: MATH_CHIPS[PASCAL_RECIPE.id],
    title: "파스칼 조합",
    grouping: "sector",
    groupTitle: "파스칼의 계산",
    // 조합론은 "어느 번호가 유망한가"에 답하지 않는다. 그래서 이 방법만 번호를 좁히지 않고
    // 조합의 모양만 고른다 - 화면에서도 점수 이야기를 하지 않는다.
    score: "번호를 좁히지 않고 45개를 그대로 두고, 조합의 모양만 골라요",
    combo: "홀짝과 저(1~22):고(23~45) 모두 2:4 / 3:3 / 4:2, 합계 100~175",
    note:
      "조합 수가 많은 모양을 고른 것이지, 그 모양이 내 조합의 당첨 확률을 올리는 건 아니에요. " +
      "흔한 모양일수록 그 모양을 나눠 갖는 조합도 많아요.",
  },
  {
    recipe: FIBONACCI_RECIPE,
    chip: MATH_CHIPS[FIBONACCI_RECIPE.id],
    title: "피보나치 분석",
    grouping: "sector",
    groupTitle: "45개를 6구간으로 나눠서",
    score:
      "피보나치 수(1·2·3·5·8·13·21·34)와 가까운 정도 25%, 전체 출현 횟수 30%, 최근 50회 출현 횟수 20%, " +
      "안 나온 기간 10%, 구간 균형 15%",
    combo: "번호 사이 간격 5개 중 3개 이상이 피보나치 수, 합계 100~175, 3연속 번호 없음",
    showGaps: true,
    note:
      "수열 번호 8개만 쓰면 후보가 너무 좁아 가까운 번호까지 점수를 줬어요. 추첨 결과가 수열을 따라간다는 " +
      "근거는 없고, 간격이 수열과 맞아도 당첨 확률은 달라지지 않아요.",
  },
  {
    recipe: GAUSSIAN_RECIPE,
    chip: MATH_CHIPS[GAUSSIAN_RECIPE.id],
    title: "가우시안 분석",
    grouping: "sector",
    groupTitle: "기대치에 가까운 번호부터",
    score:
      "번호마다 출현 횟수가 이론 기대치에서 몇 표준편차 떨어졌는지(z) 재서, 0에 가까운 번호를 앞에 둬요. " +
      "많이 나온 번호를 좋게 보지 않아요",
    combo: "합계가 평균 138에서 ±1표준편차 안(109~167), 3연속 번호 없음",
    showSumZ: true,
    showSumDistribution: true,
    note:
      "합계가 중심부라는 건 그 합계를 만드는 조합이 많다는 뜻이고, 조합 하나하나의 당첨 확률은 전부 같아요. " +
      "±1표준편차와 가중치는 정해 둔 기준이에요.",
  },
  {
    recipe: EULER_RECIPE,
    chip: MATH_CHIPS[EULER_RECIPE.id],
    title: "오일러 분석",
    grouping: "mod5",
    groupTitle: "45개를 나머지 다섯 그룹으로 나눠서",
    score:
      "전체 출현 횟수 35%, 최근 50회 출현 횟수 25%, 나머지 그룹(5로 나눈 나머지) 균형 20%, " +
      "서로소 비율 φ(n)/n 20%",
    combo: "합계 100~175, 3연속 번호 없음",
    note:
      "오일러가 제시한 공식이 아니에요. 나머지 그룹이 쉴 차례라거나 서로소가 많은 번호가 더 잘 나온다는 " +
      "근거는 없고, 번호를 묶는 기준을 바꾼 것뿐이에요.",
  },
];

function AnalysisSection({ drawNo, breakpoint }: { drawNo: number; breakpoint: "small" | "medium" | "large" }) {
  const [methodId, setMethodId] = useState(ANALYSIS_METHODS[0].recipe.id);
  const method = ANALYSIS_METHODS.find((m) => m.recipe.id === methodId) ?? ANALYSIS_METHODS[0];
  return (
    <>
      <LivePopularity drawNo={drawNo} />
      <View style={styles.chips}>
        {ANALYSIS_METHODS.map((m) => {
          const active = m.recipe.id === methodId;
          return (
            <Pressable
              key={m.recipe.id}
              onPress={() => setMethodId(m.recipe.id)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipName, active && styles.chipTextActive]}>{m.chip}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* 분석법을 바꾸면 더 뽑기 횟수도 처음부터 다시 센다 - key로 상태를 버린다. */}
      <RecipeAnalysis key={method.recipe.id} method={method} drawNo={drawNo} breakpoint={breakpoint} />
    </>
  );
}

function RecipeAnalysis({
  method,
  drawNo,
  breakpoint,
}: {
  method: AnalysisMethod;
  drawNo: number;
  breakpoint: "small" | "medium" | "large";
}) {
  const recipe = method.recipe;
  // replay 화면과 같은 캐시를 쓴다 - 한쪽에서 받아 놓으면 다른 쪽은 기다리지 않는다.
  const { data: draws, isLoading, error } = useQuery({
    queryKey: ["backtest", "draws"],
    queryFn: getDrawsForBacktest,
    staleTime: 60 * 60 * 1000,
  });
  const [extraRounds, setExtraRounds] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const addTickets = useMyLottoTickets((s) => s.addTickets);
  const credits = useDrawCredits();

  const analysis = useMemo(
    () => (draws && draws.length > 0 ? analyzeWithRecipe(recipe, draws, RULE, drawNo) : null),
    [recipe, draws, drawNo],
  );

  // 같은 회차·같은 더 뽑기 횟수면 언제 열어도 같은 번호다. 한 번에 (회차+1)×5게임을 만들어
  // 엔진이 중복을 걸러주므로, "한 번 더 뽑기"로 나온 번호가 앞서 받은 것과 겹치지 않는다.
  const games = useMemo(() => {
    if (!draws || draws.length === 0) return [];
    return recipeStrategy(recipe).generate({
      history: draws,
      rule: RULE,
      rng: seededRng(`${recipe.id}|${drawNo}`),
      ticketCount: TICKETS_PER_ROUND * (extraRounds + 1),
      targetRound: drawNo,
    });
  }, [recipe, draws, drawNo, extraRounds]);

  // games는 "더 뽑기"를 눌러도 앞서 받은 게임을 그대로 포함한 전체 목록이다(같은 시드로
  // 이어 뽑으니 앞부분이 그대로 유지된다). 그래서 매번 통째로 보내면 같은 게임을 두 번
  // 세게 된다 - 지금까지 보낸 개수를 기억해 두고 새로 늘어난 뒤쪽만 보낸다.
  const recordedCountRef = useRef(0);
  useEffect(() => {
    if (games.length <= recordedCountRef.current) return;
    const freshGames = games.slice(recordedCountRef.current);
    recordedCountRef.current = games.length;
    recordGeneratedTickets(mathSource(recipe.id), drawNo, freshGames);
  }, [games, drawNo, recipe.id]);

  // 파스칼의 계산 - 번호를 고르는 것과 상관없이 "그 조건을 만족하는 조합이 몇 개인가"다.
  const compressed = recipe.candidateCount < RULE.maxNumber;
  const shapeCount = useMemo(() => countCombinationsByShape(RULE, recipe.filters), [recipe]);
  const passingFromCandidates = useMemo(
    () => (compressed && analysis ? countPassingCombinations(analysis.candidates.map((c) => c.number), RULE, recipe.filters) : null),
    [compressed, analysis, recipe],
  );
  // 후보 압축이 무작위보다 나았는지 재는 유일한 정직한 자리. 최근 100회만 되짚는다(폰에서 즉시 끝나야 한다).
  const candidateHits = useMemo(
    () => (compressed && draws ? measureCandidateHits(recipe, draws, RULE, { rounds: 100 }) : null),
    [compressed, recipe, draws],
  );
  // 과거 합계가 실제로 어떻게 퍼져 있었는지. 이론값과 나란히 둬야 "평균 근처가 많다"는 말이
  // 주장이 아니라 숫자가 된다.
  const sumDist = useMemo(
    () => (method.showSumDistribution && draws ? sumDistribution(draws, RULE) : null),
    [method.showSumDistribution, draws],
  );

  const drawMore = useCallback(async () => {
    if (drawing) return;
    setDrawing(true);
    try {
      const permission = await requestDraw(mathSource(recipe.id), drawNo);
      setExtraRounds((n) => n + 1);
      const notice = drawNotice(permission);
      if (notice) Alert.alert("5게임 더 뽑았어요", notice);
    } finally {
      setDrawing(false);
    }
  }, [drawing, drawNo, recipe.id]);

  const share = useCallback(async () => {
    const lines = games.map((game, i) => `${i + 1} ${game.join(", ")}`);
    await Share.share({
      message: [
        compressed ? `${drawNo}회 ${method.title} - 45개에서 후보 ${recipe.candidateCount}개` : `${drawNo}회 ${method.title}`,
        compressed && analysis
          ? `후보 ${analysis.candidates.map((c) => c.number).sort((a, b) => a - b).join(", ")}`
          : "",
        "",
        ...lines,
      ].join("\n"),
    });
  }, [games, drawNo, analysis, method.title, recipe.candidateCount, compressed]);

  const save = useCallback(() => {
    const added = addTickets(games.map((numbers) => ({ drawNo, numbers, purchaseType: null, purchased: false })));
    Alert.alert(
      added.length > 0 ? "보관함에 저장했어요" : "이미 보관함에 있어요",
      added.length > 0
        ? `${drawNo}회 ${added.length}게임을 보관함에 넣었어요. 추첨 후 자동으로 확인해 드려요.`
        : `${drawNo}회에 같은 번호가 이미 저장돼 있어요.`,
    );
  }, [addTickets, games, drawNo, recipe.id]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.subtitle}>지난 회차를 불러오는 중이에요…</Text>
      </View>
    );
  }
  if (error || !analysis || !draws) {
    return (
      <View style={styles.center}>
        <Text style={styles.subtitle}>지난 회차를 불러오지 못했어요. 잠시 뒤 다시 들어와 주세요.</Text>
      </View>
    );
  }

  const best = analysis.candidates[0];
  const bestStat = analysis.stats[best.number - 1];
  const candidateNumbers = analysis.candidates.map((c) => c.number);
  // 후보를 분석법이 쓰는 묶음대로 보여준다 - 구간으로 점수를 매겼으면 구간별로, 나머지로
  // 매겼으면 나머지별로. 묶음이 어긋나면 "왜 이 번호인지"가 화면에서 설명되지 않는다.
  const groups =
    method.grouping === "mod5"
      ? Array.from({ length: MOD_GROUP_DIVISOR }, (_, r) => ({
          label: `나머지 ${r}`,
          numbers: candidateNumbers.filter((n) => modGroupOf(n) === r).sort((a, b) => a - b),
        }))
      : sectorRanges(RULE.maxNumber).map(([lo, hi], i) => ({
          label: `${lo}–${hi}`,
          numbers: candidateNumbers.filter((n) => sectorIndexOf(n, RULE.maxNumber) === i).sort((a, b) => a - b),
        }));
  const groupCap = method.grouping === "mod5" ? recipe.modGroupCap : recipe.sectorCap;

  return (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { fontSize: getResponsiveFontSize(20, breakpoint) }]}>
          {drawNo}회 {method.title}
        </Text>
        {/* 데이터가 1회부터 있는 게 아니다(실측: draw_history는 262회부터). 첫 회차를
            그대로 읽어 적는다 - "1회부터"라고 적으면 넣지도 않은 회차를 넣었다고 말하는 것이다. */}
        <Text style={styles.subtitle}>
          {draws[0].round}회부터 {draws[draws.length - 1].round}회까지 {draws.length}회를 넣었어요.{" "}
          {compressed ? `45개에서 후보 ${recipe.candidateCount}개로 좁혔어요.` : "번호는 45개 그대로예요."}
        </Text>
      </View>

      {compressed ? (
        <View style={styles.card}>
          <Text style={styles.name}>{method.groupTitle}</Text>
          <Text style={styles.method}>
            {method.score}을 더해 번호마다 점수를 매겼어요.
            {groupCap ? ` 한 묶음에서 최대 ${groupCap}개까지만 뽑아 후보가 한쪽에 몰리지 않게 했어요.` : ""}
          </Text>
          {groups.map((group) => (
            <View key={group.label} style={styles.sectorRow}>
              <Text style={styles.sectorLabel}>{group.label}</Text>
              <View style={styles.balls}>
                {group.numbers.length > 0 ? (
                  group.numbers.map((n) => <LottoBall key={n} number={n} size="small" />)
                ) : (
                  <Text style={styles.sectorEmpty}>후보 없음</Text>
                )}
              </View>
            </View>
          ))}
          <Text style={styles.sectorEmpty}>
            점수 1위는 {best.number}번이에요. 전체 {bestStat.totalFrequency}회 나왔고, 최근{" "}
            {recipe.recentWindow}회 중 {bestStat.recentFrequency}회, 마지막 출현 뒤 {bestStat.gap}회차가 지났어요.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.name}>파스칼의 계산</Text>
          <Text style={styles.method}>{method.score}.</Text>
          <Text style={styles.sectorEmpty}>
            6개를 고르는 방법은 모두 {totalCombinations(RULE).toLocaleString()}가지예요. 그중 이 모양(
            {method.combo})을 만족하는 건 {shapeCount.toLocaleString()}가지,{" "}
            {((shapeCount / totalCombinations(RULE)) * 100).toFixed(1)}%예요. 번호를 좁히지 않았으니 당첨번호 6개는
            늘 범위 안에 있고, 고른 것은 조합의 모양뿐이에요.
          </Text>
        </View>
      )}

      {sumDist && (
        <View style={styles.card}>
          <Text style={styles.name}>지난 회차 합계는 어떻게 퍼져 있나</Text>
          <Text style={styles.sectorEmpty}>
            {sumDist.rounds.toLocaleString()}회차 당첨번호 합계의 실측 평균은 {sumDist.mean.toFixed(1)},
            표준편차는 {sumDist.sd.toFixed(1)}이에요. 이론값은 평균 {sumDist.theoreticalMean}, 표준편차{" "}
            {sumDist.theoreticalSd.toFixed(2)}예요. 가장 작았던 합계는 {sumDist.min}, 가장 컸던 합계는{" "}
            {sumDist.max}이고, 평균 ±1표준편차 안에 들어온 회차는{" "}
            {(sumDist.withinOneSd * 100).toFixed(1)}%예요(정규분포라면 약 68%).
          </Text>
        </View>
      )}

      {compressed && (
        <View style={styles.card}>
          <Text style={styles.name}>파스칼로 검산하기</Text>
          <Text style={styles.sectorEmpty}>
            후보 {recipe.candidateCount}개로 만들 수 있는 6개 조합은{" "}
            {combinations(recipe.candidateCount, RULE.pickCount).toLocaleString()}가지, 그중 위 조건을 통과하는 건{" "}
            {passingFromCandidates?.toLocaleString() ?? "-"}가지예요. 전체{" "}
            {totalCombinations(RULE).toLocaleString()}가지 중 이만큼만 보는 셈이에요.
          </Text>
          {candidateHits && (
            <Text style={styles.sectorEmpty}>
              최근 {candidateHits.rounds}회를 되짚어 보면, 당첨번호 6개 중 평균{" "}
              {candidateHits.meanHits.toFixed(2)}개가 이 방법의 후보 {candidateHits.candidateCount}개 안에 있었어요.
              아무렇게나 {candidateHits.candidateCount}개를 골라도 평균 {candidateHits.expectedHits.toFixed(2)}개가
              들어와요. 3개 이상 들어온 회차는 {(candidateHits.atLeast3Ratio * 100).toFixed(0)}%로, 무작위일 때의{" "}
              {(candidateHits.expectedAtLeast3Ratio * 100).toFixed(0)}%와 비교하면 돼요.
            </Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.name}>
          {compressed ? `후보 ${recipe.candidateCount}개로 만든` : "조건을 통과한"} {games.length}게임
        </Text>
        <Text style={styles.method}>{method.combo}으로 걸렀어요.</Text>
        {games.map((game, i) => (
          <View key={game.join(",")} style={styles.bandGame}>
            <View style={styles.gameRow}>
              <Text style={styles.letter}>{i + 1}</Text>
              <View style={styles.balls}>
                {game.map((n) => (
                  <LottoBall key={n} number={n} size="small" />
                ))}
              </View>
            </View>
            {method.showGaps && <Text style={styles.bandMeta}>간격 {gapsOf(game).join(" · ")}</Text>}
            {method.showSumZ && (
              <Text style={styles.bandMeta}>
                합계 {game.reduce((s, n) => s + n, 0)} · z{" "}
                {sumZScore(game.reduce((s, n) => s + n, 0), RULE) >= 0 ? "+" : ""}
                {sumZScore(game.reduce((s, n) => s + n, 0), RULE).toFixed(2)}
              </Text>
            )}
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.primaryButton, drawing && styles.primaryButtonBusy]}
        onPress={drawMore}
        disabled={drawing}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>
          {drawing ? "잠시만요…" : drawButtonLabel("다시 뽑기", needsAdForDraw(credits, mathSource(recipe.id), drawNo))}
        </Text>
      </Pressable>
      <AdBanner />

      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={save} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>보관함에 저장</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={share} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>번호 보내기</Text>
        </Pressable>
      </View>

      <Text style={styles.disclaimer}>
        {method.note}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { paddingVertical: spacing.xl, alignItems: "center", gap: spacing.md },
  sectorRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 2 },
  sectorLabel: { width: 48, fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  sectorEmpty: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  content: { padding: spacing.lg, gap: spacing.md },
  tabs: { flexDirection: "row", gap: spacing.sm },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  tabTextActive: { color: "#FFFFFF" },
  header: { gap: spacing.xs },
  title: { fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipName: { fontSize: 13, color: colors.textPrimary, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    ...cardShadow,
  },
  name: { fontWeight: "700", color: colors.primaryDark },
  scoreCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  scoreTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  rankRow: { flexDirection: "row", gap: spacing.xs },
  rankCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  rankLabel: { fontSize: 12, color: colors.textSecondary },
  rankValue: { fontSize: 16, fontWeight: "700", color: colors.textMuted },
  rankValueHit: { color: colors.seal },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  moneyLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  moneyValue: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  sourceRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  sourceName: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  sourceValue: { fontSize: 12, color: colors.textSecondary },
  extraLabel: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  primaryButton: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  primaryButtonBusy: { opacity: 0.6 },
  primaryButtonText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  secondaryButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  achievement: { fontSize: 12, color: colors.textMuted },
  method: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginBottom: spacing.xs },
  gameRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 2 },
  bandGame: { gap: 2, paddingVertical: 2 },
  bandMeta: { fontSize: 11, color: colors.textMuted, marginLeft: 32 },
  letter: { width: 16, fontSize: 15, fontWeight: "700", color: colors.textSecondary },
  balls: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  disclaimer: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
