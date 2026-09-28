import { useMemo, useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { LottoBall } from "@/components/LottoBall";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";
import { useResponsive, getResponsiveFontSize } from "@/utils/responsive";
import {
  GENIUSES,
  generateGeniusGames,
  geniusOfToday,
  upcomingDrawNo,
  type GeniusId,
} from "@/features/generator/geniusGenerator";

const LETTERS = ["A", "B", "C", "D", "E"];

// 한 명이 회차마다 A~E 5게임을 낸다. 같은 회차에는 누가 봐도 같은 번호다.
// 확률을 높인다는 표현은 쓰지 않는다.
export default function GeneratorScreen() {
  const { breakpoint } = useResponsive();
  const drawNo = useMemo(() => upcomingDrawNo(), []);
  const [selected, setSelected] = useState<GeniusId>(() => (geniusOfToday() ?? GENIUSES[0]).id);
  const genius = GENIUSES.find((g) => g.id === selected) ?? GENIUSES[0];
  const games = useMemo(() => generateGeniusGames(genius.id, drawNo), [genius.id, drawNo]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontSize: getResponsiveFontSize(20, breakpoint) }]}>
          {drawNo}회 천재들의 한수
        </Text>
        <Text style={styles.subtitle}>
          한 명당 5게임씩, 이번 회차 내내 같은 번호예요.
        </Text>
      </View>

      <View style={styles.chips}>
        {GENIUSES.map((g) => {
          const active = g.id === selected;
          return (
            <Pressable
              key={g.id}
              onPress={() => setSelected(g.id)}
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

      <Text style={styles.disclaimer}>
        천재들의 수학 방식으로 재미 삼아 만든 번호이며, 당첨 확률을 높이거나 당첨을 보장하지
        않아요. 모든 번호 조합의 당첨 확률은 같아요. 로또는 만 19세 이상만 구매할 수 있어요.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
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
  achievement: { fontSize: 12, color: colors.textMuted },
  method: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginBottom: spacing.xs },
  gameRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 2 },
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
