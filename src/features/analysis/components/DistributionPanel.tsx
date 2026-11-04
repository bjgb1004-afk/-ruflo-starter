import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { BAND_COUNT, bandLabel, type ShapeDistribution } from "../historyStats";

interface Row {
  label: string;
  count: number;
}

// 막대는 View 너비 비율로 그린다. 가로 막대 하나를 그리려고 SVG를 꺼낼 이유가 없다.
function BarList({ rows, total }: { rows: Row[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <Text style={styles.empty}>셀 회차가 없어요</Text>;

  return (
    <View style={styles.bars}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={styles.barLabel}>{r.label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(r.count / max) * 100}%` }]} />
          </View>
          <Text style={styles.barValue}>
            {r.count}
            {total > 0 ? ` (${((r.count / total) * 100).toFixed(0)}%)` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** 개수별 회차 수 배열을 "n개: m회차" 줄로. 0인 칸은 빼서 목록이 길어지지 않게 한다. */
function countRows(counts: number[], suffix: string, skipZero = false): Row[] {
  return counts
    .map((count, n) => ({ label: `${n}${suffix}`, count, n }))
    .filter((r) => r.count > 0 && !(skipZero && r.n === 0))
    .map(({ label, count }) => ({ label, count }));
}

export function DistributionPanel({ dist, pickCount }: { dist: ShapeDistribution; pickCount: number }) {
  // 히스토그램이 비어 있는 양 끝 칸은 자른다. 6/45는 21~255가 가능하지만 실제로는 중앙에
  // 몰려 있어, 안 자르면 빈 막대 스무 줄을 스크롤해야 한다.
  const used = dist.sumHistogram.filter((b) => b.count > 0);

  return (
    <View style={styles.card}>
      <Text style={styles.header}>{dist.count}회차를 세었어요</Text>

      <Section title={`합계 — 평균 ${dist.sumMean.toFixed(1)} · 최소 ${dist.sumMin} · 최대 ${dist.sumMax}`}>
        <BarList rows={used.map((b) => ({ label: `${b.from}~${b.to}`, count: b.count }))} total={dist.count} />
      </Section>

      <Section title="홀짝">
        <BarList
          rows={dist.oddCounts
            .map((count, odd) => ({ label: `홀${odd} : 짝${pickCount - odd}`, count }))
            .filter((r) => r.count > 0)}
          total={dist.count}
        />
      </Section>

      <Section title="저(1~22) : 고(23~45)">
        <BarList
          rows={dist.lowCounts
            .map((count, low) => ({ label: `저${low} : 고${pickCount - low}`, count }))
            .filter((r) => r.count > 0)}
          total={dist.count}
        />
      </Section>

      <Section title="번호대">
        <BarList
          rows={Array.from({ length: BAND_COUNT }, (_, i) => ({
            label: bandLabel(i),
            count: dist.bandTotals[i],
          }))}
          total={dist.count * pickCount}
        />
      </Section>

      <Section title="가장 긴 연속번호">
        <BarList rows={countRows(dist.consecutiveCounts, "개 연속", true)} total={dist.count} />
      </Section>

      <Section title="같은 끝수 겹침">
        <BarList rows={countRows(dist.sameEndingCounts, "개", true)} total={dist.count} />
      </Section>

      <Section title="직전 회차와 겹친 개수">
        <BarList rows={countRows(dist.carryOverCounts, "개")} total={Math.max(0, dist.count - 1)} />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  header: { fontSize: 13, color: colors.textMuted },
  section: { gap: spacing.xs },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  bars: { gap: 3 },
  empty: { fontSize: 12, color: colors.textMuted },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  barLabel: { width: 86, fontSize: 11, color: colors.textSecondary },
  barTrack: { flex: 1, height: 12, backgroundColor: colors.background, borderRadius: 6, overflow: "hidden" },
  barFill: { height: 12, backgroundColor: colors.primary, borderRadius: 6 },
  barValue: { width: 76, fontSize: 11, color: colors.textSecondary, textAlign: "right" },
});
