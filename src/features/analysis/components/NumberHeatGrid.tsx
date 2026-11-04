import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { getResponsiveFontSize, useResponsive } from "@/utils/responsive";
import type { NumberGapStats } from "../historyStats";

export type HeatMetric = "count" | "idle" | "meanGap";

const METRICS: readonly { key: HeatMetric; label: string }[] = [
  { key: "count", label: "출현 횟수" },
  { key: "idle", label: "안 나온 기간" },
  { key: "meanGap", label: "평균 출현 간격" },
];

// 지표마다 "전체 기준"인지 "선택 구간 기준"인지 다르다. 섞으면 숫자가 거짓이 된다 -
// 최근 10회만 잘라 미출현 기간을 재면 11회 전에 나온 번호가 "10회 미출현"으로 보인다.
const METRIC_BASIS: Record<HeatMetric, "span" | "all"> = {
  count: "span",
  idle: "all",
  meanGap: "all",
};

interface Props {
  metric: HeatMetric;
  onMetricChange: (m: HeatMetric) => void;
  /** 선택 구간의 번호별 출현 횟수. counts[n]이 n번 횟수(0번 칸은 안 쓴다). */
  counts: number[];
  /** 전체 기준 간격 통계. 길이 maxNumber, 0-index가 1번. */
  gaps: NumberGapStats[];
  partnersOf: (n: number) => { number: number; count: number }[];
  spanLabel: string;
  maxNumber: number;
}

function valueOf(metric: HeatMetric, n: number, counts: number[], gaps: NumberGapStats[]): number | null {
  const g = gaps[n - 1];
  if (metric === "count") return counts[n] ?? 0;
  if (metric === "idle") return g?.roundsSince ?? null;
  return g?.meanGap ?? null;
}

export function NumberHeatGrid({ metric, onMetricChange, counts, gaps, partnersOf, spanLabel, maxNumber }: Props) {
  const { breakpoint } = useResponsive();
  const [open, setOpen] = useState<number | null>(null);

  const numbers = Array.from({ length: maxNumber }, (_, i) => i + 1);
  const values = numbers.map((n) => valueOf(metric, n, counts, gaps));
  const present = values.filter((v): v is number => v !== null);
  const max = present.length ? Math.max(...present) : 0;
  const min = present.length ? Math.min(...present) : 0;

  const detail = open === null ? null : gaps[open - 1];
  const basis = METRIC_BASIS[metric] === "span" ? spanLabel : "전체 회차";

  return (
    <View style={styles.card}>
      <View style={styles.chips}>
        {METRICS.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => onMetricChange(m.key)}
            style={[styles.chip, metric === m.key && styles.chipActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, metric === m.key && styles.chipTextActive]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.basis, { fontSize: getResponsiveFontSize(12, breakpoint) }]}>{basis} 기준</Text>

      <View style={styles.grid}>
        {numbers.map((n, i) => {
          const v = values[i];
          // 값이 큰 번호일수록 진하게. 색은 테마의 금색 하나만 쓰고 투명도로 농도를 만든다.
          const ratio = v === null || max === min ? 0 : (v - min) / (max - min);
          return (
            <Pressable
              key={n}
              onPress={() => setOpen(open === n ? null : n)}
              style={[
                styles.cell,
                { backgroundColor: `rgba(184, 135, 58, ${0.08 + ratio * 0.75})` },
                open === n && styles.cellOpen,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${n}번 ${v ?? "자료 없음"}`}
            >
              <Text style={[styles.cellNumber, ratio > 0.55 && styles.cellTextOnDark]}>{n}</Text>
              <Text style={[styles.cellValue, ratio > 0.55 && styles.cellTextOnDark]}>
                {v === null ? "-" : metric === "meanGap" ? v.toFixed(1) : v}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {detail && (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>{detail.number}번</Text>
          <Text style={styles.detailLine}>
            {spanLabel} 출현 {counts[detail.number] ?? 0}회 · 전체 {detail.appearances}회
          </Text>
          <Text style={styles.detailLine}>
            {detail.lastRound === null
              ? "한 번도 나오지 않았어요"
              : `마지막 출현 ${detail.lastRound}회 (${detail.roundsSince}회 전)`}
          </Text>
          <Text style={styles.detailLine}>
            {detail.meanGap === null
              ? "출현 간격 - 두 번 이상 나와야 셀 수 있어요"
              : `출현 간격 평균 ${detail.meanGap.toFixed(1)}회 / 최단 ${detail.minGap}회 / 최장 ${detail.maxGap}회`}
          </Text>
          <Text style={styles.detailLine}>
            함께 많이 나온 번호 —{" "}
            {partnersOf(detail.number)
              .map((p) => `${p.number}(${p.count}회)`)
              .join(" ") || "없음"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: colors.primaryDark, fontWeight: "700" },
  basis: { color: colors.textMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  cell: {
    width: 44,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cellOpen: { borderWidth: 2, borderColor: colors.seal },
  cellNumber: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  cellValue: { fontSize: 10, color: colors.textSecondary },
  cellTextOnDark: { color: "#fff" },
  detail: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  detailTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  detailLine: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
