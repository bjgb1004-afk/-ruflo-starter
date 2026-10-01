import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getDrawsForBacktest } from "@/features/backtest/api/backtestDrawsApi";
import { runRecipes } from "@/features/backtest/engine";
import { PRESET_RECIPES } from "@/features/backtest/recipes";
import { judgeResults, theoreticalMeanMatches, verdictLabel } from "@/features/backtest/significance";
import { DEFAULT_OPTIONS, KOREA_LOTTO_6_45, type LottoDraw } from "@/features/backtest/types";
import type { StrategyVerdict } from "@/features/backtest/significance";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

const RULE = KOREA_LOTTO_6_45;

// 회차 수를 늘리면 정확해지는 대신 폰에서 오래 돈다. 기본을 300으로 두고 더 보고 싶으면
// 올리게 한다.
const SPANS: readonly { label: string; rounds: number }[] = [
  { label: "최근 300회", rounds: 300 },
  { label: "최근 600회", rounds: 600 },
  { label: "전체", rounds: Number.POSITIVE_INFINITY },
];

interface Outcome {
  verdicts: StrategyVerdict[];
  testRange: { from: number; to: number };
  drawsTested: number;
  totalTickets: number;
}

function runOnce(draws: readonly LottoDraw[], rounds: number): Outcome {
  // 분석에 쓸 과거가 필요하므로 테스트 구간 앞에 minimumHistory만큼 더 떼어 온다.
  const span = Number.isFinite(rounds) ? rounds + DEFAULT_OPTIONS.minimumHistory : draws.length;
  const slice = draws.slice(Math.max(0, draws.length - span));

  const run = runRecipes(slice, PRESET_RECIPES, { ...DEFAULT_OPTIONS, rule: RULE, ticketCount: 5 });
  return {
    verdicts: judgeResults(run.results, RULE),
    testRange: run.meta.testRange,
    drawsTested: run.results[0]?.drawsTested ?? 0,
    totalTickets: run.results[0]?.totalTickets ?? 0,
  };
}

export default function BacktestScreen() {
  const { data: draws, isLoading, error } = useQuery({
    queryKey: ["backtest", "draws"],
    queryFn: getDrawsForBacktest,
    staleTime: 60 * 60 * 1000,
  });

  const [spanIndex, setSpanIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const baseline = useMemo(() => theoreticalMeanMatches(RULE), []);

  const start = useCallback(() => {
    if (!draws) return;
    setRunning(true);
    setOutcome(null);
    // 계산이 한 번에 몇 초씩 걸려 화면이 멈춘다. 돌리기 전에 "계산 중" 상태를 먼저 그리게
    // 한 프레임 넘긴다.
    setTimeout(() => {
      try {
        setOutcome(runOnce(draws, SPANS[spanIndex].rounds));
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [draws, spanIndex]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>지난 회차를 불러오는 중이에요</Text>
      </View>
    );
  }

  if (error || !draws) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>회차를 불러오지 못했어요. 잠시 뒤 다시 열어주세요.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>번호 뽑는 방법, 과거에 통했나</Text>
        <Text style={styles.subtitle}>
          지난 회차를 하나씩 되짚으며 그 시점까지의 정보만으로 번호를 뽑아보고, 실제 당첨번호와 몇 개나 맞았는지 셉니다.
          미래 정보는 쓰지 않아요.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>얼마나 되짚을까요</Text>
        <View style={styles.chips}>
          {SPANS.map((s, i) => {
            const active = i === spanIndex;
            return (
              <Pressable
                key={s.label}
                onPress={() => setSpanIndex(i)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>
          회차마다 5게임씩, 방법 {PRESET_RECIPES.length}가지를 같은 조건으로 돌립니다. 회차를 늘리면 더 오래 걸려요.
        </Text>
      </View>

      <Pressable
        style={[styles.primaryButton, running && styles.buttonDisabled]}
        onPress={start}
        disabled={running}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>{running ? "계산하는 중…" : "돌려보기"}</Text>
      </Pressable>

      {running && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>회차를 하나씩 되짚고 있어요. 잠시만요.</Text>
        </View>
      )}

      {outcome && <Results outcome={outcome} baseline={baseline} />}

      <Text style={styles.disclaimer}>
        과거에 어땠는지만 보여줍니다. 로또는 회차마다 독립이라 어떤 방법도 다음 회차 당첨 확률을 바꾸지 못해요.
      </Text>
    </ScrollView>
  );
}

function Results({ outcome, baseline }: { outcome: Outcome; baseline: number }) {
  const { verdicts, testRange, drawsTested, totalTickets } = outcome;

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>돌린 조건</Text>
        <Row label="되짚은 구간" value={`${testRange.from} ~ ${testRange.to}회`} />
        <Row label="회차 수" value={`${drawsTested.toLocaleString()}회`} />
        <Row label="방법마다 뽑은 게임" value={`${totalTickets.toLocaleString()}게임`} />
        <Row label="기준선(계산값)" value={`${baseline.toFixed(4)}개`} />
        <Text style={styles.note}>
          기준선은 재본 값이 아니라 계산으로 나오는 값이에요. 6개를 45개 중에서 고르면 평균 {baseline.toFixed(2)}개가
          맞습니다. 오차가 없는 값이라 여기에 견주면 됩니다.
        </Text>
      </View>

      {verdicts.map((v) => (
        <View key={v.strategyId} style={styles.card}>
          <Text style={styles.recipeName}>{v.strategyName}</Text>
          <View style={styles.meanRow}>
            <Text style={styles.mean}>{v.observedMean.toFixed(4)}</Text>
            <Text style={styles.meanUnit}>개 맞음 (평균)</Text>
          </View>
          <Text style={styles.ci}>
            95% 범위 [{v.ci.lower.toFixed(4)}, {v.ci.upper.toFixed(4)}]
          </Text>
          <Text style={[styles.verdict, verdictStyle(v)]}>{verdictLabel(v)}</Text>

          <View style={styles.breakdown}>
            <View style={styles.breakdownHead}>
              <Text style={[styles.cell, styles.cellFirst]}>맞은 개수</Text>
              <Text style={styles.cell}>실제</Text>
              <Text style={styles.cell}>무작위 기대</Text>
            </View>
            {v.breakdown
              .filter((b) => b.matches >= 3)
              .map((b) => (
                <View key={b.matches} style={styles.breakdownRow}>
                  <Text style={[styles.cell, styles.cellFirst]}>{b.matches}개</Text>
                  <Text style={styles.cell}>{b.observed.toLocaleString()}</Text>
                  <Text style={styles.cell}>
                    {b.expected.toFixed(b.expected < 10 ? 2 : 0)}
                    {b.insufficient ? " *" : ""}
                  </Text>
                </View>
              ))}
          </View>
          {v.breakdown.some((b) => b.matches >= 3 && b.insufficient) && (
            <Text style={styles.note}>* 표시는 기대 건수가 너무 적어 이 숫자로는 아무 말도 할 수 없는 칸이에요.</Text>
          )}
        </View>
      ))}
    </>
  );
}

function verdictStyle(v: StrategyVerdict) {
  if (v.comparison === "below") return styles.verdictBelow;
  if (v.comparison === "above") return styles.verdictAbove;
  return styles.verdictSame;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  header: { gap: spacing.xs },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...cardShadow,
  },
  cardLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  chips: { flexDirection: "row", gap: spacing.sm },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  chipTextActive: { color: "#FFFFFF" },
  note: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  buttonDisabled: { opacity: 0.5 },
  muted: { fontSize: 13, color: colors.textSecondary, textAlign: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontSize: 13, color: colors.textSecondary },
  rowValue: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, ...numericFont },
  recipeName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  meanRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  mean: { fontSize: 26, fontWeight: "700", color: colors.textPrimary, ...numericFont },
  meanUnit: { fontSize: 13, color: colors.textSecondary, paddingBottom: 4 },
  ci: { fontSize: 12, color: colors.textSecondary, ...numericFont },
  verdict: { fontSize: 13, fontWeight: "700", lineHeight: 19 },
  verdictSame: { color: colors.textSecondary },
  verdictAbove: { color: colors.primary },
  verdictBelow: { color: colors.textMuted },
  breakdown: { marginTop: spacing.xs },
  breakdownHead: {
    flexDirection: "row",
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  breakdownRow: { flexDirection: "row", paddingVertical: 3 },
  cell: { flex: 1, textAlign: "right", fontSize: 12, color: colors.textSecondary, ...numericFont },
  cellFirst: { textAlign: "left" },
  disclaimer: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
});
