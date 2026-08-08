import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  getSidoLuckDensity,
  getSidoPurchaseTypeRatio,
  type SidoPurchaseTypeRatio,
} from "@/features/stats/api/regionalStatsApi";
import { Skeleton } from "@/components/Skeleton";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

interface Props {
  onPressSido: (sido: string) => void;
}

const PurchaseTypeBar = memo(function PurchaseTypeBar({ ratio }: { ratio: SidoPurchaseTypeRatio }) {
  if (ratio.totalCount === 0) {
    return <Text style={styles.purchaseEmptyText}>구매방식이 확인된 1등 배출 이력이 없어요.</Text>;
  }
  const autoPct = Math.round((ratio.autoCount / ratio.totalCount) * 100);
  const manualPct = Math.round((ratio.manualCount / ratio.totalCount) * 100);
  const semiPct = Math.max(0, 100 - autoPct - manualPct);

  return (
    <View style={styles.purchaseWrap}>
      <View style={styles.purchaseBarTrack}>
        {autoPct > 0 && <View style={[styles.purchaseSegment, { width: `${autoPct}%`, backgroundColor: colors.primary }]} />}
        {manualPct > 0 && <View style={[styles.purchaseSegment, { width: `${manualPct}%`, backgroundColor: colors.seal }]} />}
        {semiPct > 0 && <View style={[styles.purchaseSegment, { width: `${semiPct}%`, backgroundColor: colors.silver }]} />}
      </View>
      <Text style={styles.purchaseLegend}>
        자동 {autoPct}% · 수동 {manualPct}% · 반자동 {semiPct}%
      </Text>
    </View>
  );
});

// design.txt Feature 1(명당 밀도/행운 지수) + Feature 3(자동/수동/반자동 비율)을
// 하나의 카드 리스트로 결합: 카드 본문 터치는 랭킹 화면 이동(공통 처리 지시사항 #3),
// 우측 화살표 토글은 그 지역의 구매방식 비율을 펼쳐서 보여준다.
export const LuckDensityList = memo(function LuckDensityList({ onPressSido }: Props) {
  const { data: density = [], isLoading } = useQuery({
    queryKey: ["stats", "luck-density"],
    queryFn: getSidoLuckDensity,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: purchaseRatios } = useQuery({
    queryKey: ["stats", "purchase-ratio"],
    queryFn: getSidoPurchaseTypeRatio,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const purchaseBySido = useMemo(() => {
    const map = new Map<string, SidoPurchaseTypeRatio>();
    (purchaseRatios ?? []).forEach((r) => map.set(r.sido, r));
    return map;
  }, [purchaseRatios]);

  const [expandedSido, setExpandedSido] = useState<string | null>(null);
  const handleToggleExpand = useCallback((sido: string) => {
    setExpandedSido((prev) => (prev === sido ? null : sido));
  }, []);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🍀 지역별 명당 밀도(행운 지수)</Text>
      <Text style={styles.subtitle}>매장 1곳당 평균 1등 배출 횟수 - 높을수록 "밀도 높은" 지역</Text>

      {isLoading ? (
        <View style={styles.skeletonWrap}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          {density.map((row, idx) => {
            const ratio = purchaseBySido.get(row.sido);
            const isExpanded = expandedSido === row.sido;
            return (
              <View key={row.sido} style={styles.rowWrap}>
                <Pressable style={styles.row} onPress={() => onPressSido(row.sido)}>
                  <View style={[styles.rankChip, idx === 0 && styles.rankChipTop]}>
                    <Text style={[styles.rankChipText, idx === 0 && styles.rankChipTextTop]}>{idx + 1}</Text>
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowSido}>
                      {row.sido} {idx === 0 && "(전국 명당 밀도 1위 🏆)"}
                    </Text>
                    <Text style={styles.rowDetail}>
                      매장당 평균 1등 {row.luckIndex.toFixed(2)}회 · 매장 {row.storeCount.toLocaleString()}곳 · 누적 1등{" "}
                      {row.totalFirstPrize.toLocaleString()}회
                    </Text>
                  </View>
                  {ratio && ratio.totalCount > 0 && (
                    <Pressable
                      hitSlop={8}
                      style={styles.expandButton}
                      onPress={() => handleToggleExpand(row.sido)}
                    >
                      <Text style={styles.expandButtonText}>{isExpanded ? "▲" : "▼"}</Text>
                    </Pressable>
                  )}
                </Pressable>
                {isExpanded && ratio && (
                  <View style={styles.purchaseSection}>
                    <PurchaseTypeBar ratio={ratio} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  title: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: -spacing.sm },
  skeletonWrap: { gap: spacing.sm },
  list: { gap: spacing.sm },
  rowWrap: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  rankChip: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.rankNeutral,
    alignItems: "center",
    justifyContent: "center",
  },
  rankChipTop: { backgroundColor: colors.goldBright },
  rankChipText: { fontSize: 12, fontWeight: "800", color: "#fff", fontFamily: numericFont.bold },
  rankChipTextTop: { color: "#fff" },
  rowInfo: { flex: 1, gap: 2 },
  rowSido: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  rowDetail: { fontSize: 11, color: colors.textSecondary, fontFamily: numericFont.regular },
  expandButton: { paddingHorizontal: spacing.xs },
  expandButtonText: { fontSize: 12, color: colors.textMuted },
  purchaseSection: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  purchaseWrap: { gap: spacing.xs },
  purchaseBarTrack: {
    flexDirection: "row",
    height: 14,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.border,
  },
  purchaseSegment: { height: "100%" },
  purchaseLegend: { fontSize: 11, color: colors.textSecondary, fontFamily: numericFont.regular },
  purchaseEmptyText: { fontSize: 11, color: colors.textMuted },
});
