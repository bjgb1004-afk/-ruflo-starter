import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  getConsecutiveWinAreas,
  getRegionalTrend,
  type TrendWindow,
} from "@/features/stats/api/regionalStatsApi";
import { Skeleton } from "@/components/Skeleton";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

const TABS: { label: string; window: TrendWindow }[] = [
  { label: "최근 4주", window: 4 },
  { label: "최근 10주", window: 10 },
  { label: "전체 누적", window: null },
];

interface Props {
  onPressSido: (sido: string) => void;
}

// "최근 핫스팟" - 통계 페이지 최상단 강조 영역. 🔴 이번 달 HOT 지역은 탭 선택과 무관하게
// 항상 최근 4주 기준으로 고정(design.txt 명시), 아래 목록만 탭에 따라 4주/10주/전체 전환.
export const HotspotTrendCard = memo(function HotspotTrendCard({ onPressSido }: Props) {
  const [window, setWindow] = useState<TrendWindow>(4);

  const { data: hotTrend } = useQuery({
    queryKey: ["stats", "regional-trend", 4],
    queryFn: () => getRegionalTrend(4),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const hotSido = hotTrend?.[0];

  const { data: streakAreas } = useQuery({
    queryKey: ["stats", "consecutive-win", 3],
    queryFn: () => getConsecutiveWinAreas(3),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: trend = [], isLoading } = useQuery({
    queryKey: ["stats", "regional-trend", window],
    queryFn: () => getRegionalTrend(window),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const maxCount = useMemo(() => Math.max(1, ...trend.map((t) => t.firstPrizeCount)), [trend]);

  const handlePressTab = useCallback((w: TrendWindow) => setWindow(w), []);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🔥 최근 핫스팟</Text>

      {(hotSido || (streakAreas && streakAreas.length > 0)) && (
        <View style={styles.badgeRow}>
          {hotSido && (
            <Pressable style={styles.badge} onPress={() => onPressSido(hotSido.sido)}>
              <Text style={styles.badgeText}>
                🔴 이번 달 HOT · {hotSido.sido} ({hotSido.firstPrizeCount}건)
              </Text>
            </Pressable>
          )}
          {streakAreas?.slice(0, 2).map((a) => (
            <Pressable key={`${a.sido}-${a.sigungu}`} style={styles.badgeAlt} onPress={() => onPressSido(a.sido)}>
              <Text style={styles.badgeAltText}>
                ⚡ {a.sigungu} {a.streakWeeks}주 연속
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.label}
            style={[styles.tab, window === tab.window && styles.tabActive]}
            onPress={() => handlePressTab(tab.window)}
          >
            <Text style={[styles.tabText, window === tab.window && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.skeletonWrap}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={32} style={styles.skeletonRow} />
          ))}
        </View>
      ) : trend.length === 0 ? (
        <Text style={styles.emptyText}>해당 기간에 1등 배출 이력이 없어요.</Text>
      ) : (
        <View style={styles.trendList}>
          {trend.slice(0, 5).map((row, idx) => (
            <Pressable key={row.sido} style={styles.trendRow} onPress={() => onPressSido(row.sido)}>
              <Text style={styles.trendRank}>{idx + 1}</Text>
              <Text style={styles.trendSido} numberOfLines={1}>
                {row.sido}
              </Text>
              <View style={styles.trendBarTrack}>
                <View
                  style={[styles.trendBarFill, { width: `${(row.firstPrizeCount / maxCount) * 100}%` }]}
                />
              </View>
              <Text style={styles.trendCount}>{row.firstPrizeCount}</Text>
            </Pressable>
          ))}
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
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badge: {
    backgroundColor: colors.sealLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: colors.seal },
  badgeAlt: {
    backgroundColor: colors.goldLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
  },
  badgeAltText: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
  tabBar: { flexDirection: "row", gap: spacing.sm },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  tabTextActive: { color: "#fff" },
  skeletonWrap: { gap: spacing.sm },
  skeletonRow: { width: "100%" },
  emptyText: { fontSize: 13, color: colors.textMuted, paddingVertical: spacing.sm },
  trendList: { gap: spacing.sm },
  trendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  trendRank: { width: 16, fontSize: 12, fontWeight: "700", color: colors.textMuted, fontFamily: numericFont.medium },
  trendSido: { width: 78, fontSize: 12, fontWeight: "600", color: colors.textPrimary },
  trendBarTrack: { flex: 1, height: 10, borderRadius: radius.sm, backgroundColor: colors.background, overflow: "hidden" },
  trendBarFill: { height: "100%", backgroundColor: colors.gold, borderRadius: radius.sm },
  trendCount: { width: 28, textAlign: "right", fontSize: 12, fontWeight: "700", color: colors.textSecondary, fontFamily: numericFont.medium },
});
