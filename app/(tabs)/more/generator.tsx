import { useCallback, useMemo, useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, Share, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LottoBall } from "@/components/LottoBall";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";
import { useResponsive, getResponsiveFontSize } from "@/utils/responsive";
import {
  GENIUSES,
  generateExtraGames,
  generateGeniusGames,
  geniusOfToday,
  upcomingDrawNo,
  type GeniusId,
} from "@/features/generator/geniusGenerator";
import {
  formatThreadPost,
  generateBandGames,
  generateDailyBandGames,
  kstDateKey,
  type BandGame,
} from "@/features/generator/bandGenerator";
import { useMyLottoTickets } from "@/features/mylotto/useMyLottoTickets";

const LETTERS = ["A", "B", "C", "D", "E"];

type Mode = "genius" | "band";

const MODES: readonly { id: Mode; label: string }[] = [
  { id: "genius", label: "천재들의 한수" },
  { id: "band", label: "번호대 분석" },
];

export default function GeneratorScreen() {
  const { breakpoint } = useResponsive();
  // 제스처바가 있는 기기에서는 마지막 줄이 그 뒤로 들어가 안 읽힌다.
  const insets = useSafeAreaInsets();
  const drawNo = useMemo(() => upcomingDrawNo(), []);
  const [mode, setMode] = useState<Mode>("genius");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
    >
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

      {mode === "genius" ? (
        <GeniusSection drawNo={drawNo} breakpoint={breakpoint} />
      ) : (
        <BandSection drawNo={drawNo} breakpoint={breakpoint} />
      )}
    </ScrollView>
  );
}

// ---------- 천재들의 한수 (기존) ----------

// 한 명이 회차마다 A~E 5게임을 낸다. 같은 회차에는 누가 봐도 같은 번호다.
// 확률을 높인다는 표현은 쓰지 않는다.
function GeniusSection({ drawNo, breakpoint }: { drawNo: number; breakpoint: "small" | "medium" | "large" }) {
  const [selected, setSelected] = useState<GeniusId>(() => (geniusOfToday() ?? GENIUSES[0]).id);
  // 추가로 뽑은 횟수. 천재를 바꾸면 처음부터 다시 센다.
  const [extraRounds, setExtraRounds] = useState(0);
  const genius = GENIUSES.find((g) => g.id === selected) ?? GENIUSES[0];
  const addTickets = useMyLottoTickets((s) => s.addTickets);
  const games = useMemo(() => generateGeniusGames(genius.id, drawNo), [genius.id, drawNo]);
  const extras = useMemo(
    () => Array.from({ length: extraRounds }, (_, i) => generateExtraGames(genius.id, drawNo, i + 1)),
    [genius.id, drawNo, extraRounds],
  );

  const pickGenius = (id: GeniusId) => {
    setSelected(id);
    setExtraRounds(0);
  };

  // 화면에 떠 있는 것 전부 - 기본 5게임에 '한 번 더 뽑기'로 추가된 세트까지.
  const allGames = useMemo(() => [...games, ...extras.flat()], [games, extras]);

  const share = useCallback(async () => {
    const lines = allGames.map((game, i) => `${LETTERS[i % LETTERS.length]} ${game.join(", ")}`);
    await Share.share({
      message: [
        `${drawNo}회 천재들의 한수 - ${genius.name}`,
        "",
        ...lines,
        "",
        "당첨 확률은 어떤 조합이든 같아요.",
      ].join("\n"),
    });
  }, [allGames, drawNo, genius.name]);

  const save = useCallback(() => {
    addTickets(allGames.map((numbers) => ({ drawNo, numbers, purchaseType: null })));
    Alert.alert(
      "보관함에 저장했어요",
      `${drawNo}회 ${allGames.length}게임을 보관함에 넣었어요. 추첨 후 자동으로 확인해 드려요.`,
    );
  }, [addTickets, allGames, drawNo]);

  return (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { fontSize: getResponsiveFontSize(20, breakpoint) }]}>
          {drawNo}회 천재들의 한수
        </Text>
        <Text style={styles.subtitle}>한 명당 5게임씩, 이번 회차 내내 같은 번호예요.</Text>
      </View>

      <View style={styles.chips}>
        {GENIUSES.map((g) => {
          const active = g.id === selected;
          return (
            <Pressable
              key={g.id}
              onPress={() => pickGenius(g.id)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipName, active && styles.chipTextActive]}>{g.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={[styles.name, { fontSize: getResponsiveFontSize(17, breakpoint) }]}>{genius.name}</Text>
        <Text style={styles.achievement}>{genius.achievement}</Text>
        <Text style={styles.method}>{genius.method}</Text>
        {games.map((game, i) => (
          <View key={game.join(",")} style={styles.gameRow}>
            <Text style={styles.letter}>{LETTERS[i]}</Text>
            <View style={styles.balls}>
              {game.map((n) => (
                <LottoBall key={n} number={n} size="small" />
              ))}
            </View>
          </View>
        ))}
      </View>

      {extras.map((set, round) => (
        <View key={`extra-${round}`} style={styles.card}>
          <Text style={styles.extraLabel}>더 뽑기 {round + 1}회</Text>
          {set.map((game, i) => (
            <View key={game.join(",")} style={styles.gameRow}>
              <Text style={styles.letter}>{LETTERS[i]}</Text>
              <View style={styles.balls}>
                {game.map((n) => (
                  <LottoBall key={n} number={n} size="small" />
                ))}
              </View>
            </View>
          ))}
        </View>
      ))}

      <Pressable style={styles.primaryButton} onPress={() => setExtraRounds((n) => n + 1)} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>한 번 더 뽑기</Text>
      </Pressable>

      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={save} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>보관함에 저장</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={share} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>번호 보내기</Text>
        </Pressable>
      </View>

      <Text style={styles.disclaimer}>
        천재들의 수학 방식으로 만든 번호이며, 당첨 확률을 높이거나 당첨을 보장하지 않아요. 모든 번호 조합의 당첨
        확률은 같아요.
      </Text>
    </>
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

  const reroll = useCallback(() => {
    setGames(generateBandGames());
    setIsToday(false);
  }, []);

  const share = useCallback(async () => {
    await Share.share({ message: formatThreadPost(games, { drawNo }) });
  }, [games, drawNo]);

  const save = useCallback(() => {
    addTickets(games.map((g) => ({ drawNo, numbers: g.numbers, purchaseType: null })));
    Alert.alert("보관함에 저장했어요", `${drawNo}회 ${games.length}게임을 보관함에 넣었어요. 추첨 후 자동으로 확인해 드려요.`);
  }, [addTickets, games, drawNo]);

  return (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { fontSize: getResponsiveFontSize(20, breakpoint) }]}>
          {drawNo}회 번호대 분석
        </Text>
        <Text style={styles.subtitle}>
          {isToday
            ? `오늘(${dateKey})의 추천 5게임이에요. 다시 뽑으면 나만의 번호가 나와요.`
            : "방금 새로 뽑은 5게임이에요."}
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
              <Text style={styles.letter}>{LETTERS[i]}</Text>
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

      <Pressable style={styles.primaryButton} onPress={reroll} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>다시 뽑기</Text>
      </Pressable>

      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={save} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>보관함에 저장</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={share} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>번호 보내기</Text>
        </Pressable>
      </View>

      <Text style={styles.disclaimer}>
        통계 참고용이며 당첨 확률을 높여주지 않습니다. 모든 번호 조합의 당첨 확률은 같아요.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  extraLabel: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  primaryButton: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
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
