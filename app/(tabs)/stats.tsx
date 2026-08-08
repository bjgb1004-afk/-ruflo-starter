import { StyleSheet, Text, View, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState, memo } from "react";
import { getRegionalStats, type RegionalStatsRow } from "@/features/draws/api/drawHistoryApi";
import { HotspotTrendCard } from "@/features/stats/components/HotspotTrendCard";
import { RecentDrawSummary } from "@/features/stats/components/RecentDrawSummary";
import { LuckDensityList } from "@/features/stats/components/LuckDensityList";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

const MIN_BAR_WIDTH_PERCENT = 4; // 값이 0이 아니면 최소한 눈에 보이도록

const RegionalStatRow = memo(function RegionalStatRow({
  stat,
  maxFirst,
  maxSecond,
  onPress,
}: {
  stat: RegionalStatsRow;
  maxFirst: number;
  maxSecond: number;
  onPress?: (sido: string) => void;
}) {
  const region = stat.sido || "기타";
  const hasSecond = stat.second_prize_count > 0;

  const firstWidth =
    stat.first_prize_count > 0
      ? Math.max(MIN_BAR_WIDTH_PERCENT, (stat.first_prize_count / maxFirst) * 100)
      : 0;
  const secondWidth =
    stat.second_prize_count > 0
      ? Math.max(MIN_BAR_WIDTH_PERCENT, (stat.second_prize_count / maxSecond) * 100)
      : 0;

  const handlePress = useCallback(() => {
    if (stat.sido) onPress?.(stat.sido);
  }, [onPress, stat.sido]);

  return (
    <Pressable style={styles.statRow} onPress={handlePress} disabled={!stat.sido}>
      <View style={styles.statRegionRow}>
        <Text style={styles.statRegion}>{region}</Text>
        {stat.sido && <Text style={styles.statRegionLink}>명당 랭킹 보기 ›</Text>}
      </View>
      <View style={styles.statBars}>
        <View style={styles.statBar}>
          <View style={[styles.barFill, styles.bar1st, { width: `${firstWidth}%` }]} />
          <Text style={styles.barLabel}>1등 {stat.first_prize_count}</Text>
        </View>
        {hasSecond && (
          <View style={styles.statBar}>
            <View style={[styles.barFill, styles.bar2nd, { width: `${secondWidth}%` }]} />
            <Text style={styles.barLabel}>2등 {stat.second_prize_count}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

export default function StatsScreen() {
  const router = useRouter();
  const handleRegionPress = useCallback(
    (sido: string) => {
      router.push({ pathname: "/(tabs)/ranking", params: { sido } });
    },
    [router],
  );

  const { data: regionalStats = [], isLoading: isLoadingRegional } = useQuery({
    queryKey: ["stats", "regional"],
    queryFn: getRegionalStats,
    staleTime: 10 * 60 * 1000, // 10분 캐시 (변화가 적음)
    gcTime: 30 * 60 * 1000,
  });

  const [regionalStatsExpanded, setRegionalStatsExpanded] = useState(true);
  const handleToggleRegionalStats = useCallback(() => {
    setRegionalStatsExpanded((prev) => !prev);
  }, []);

  const maxFirst = useMemo(
    () => Math.max(1, ...regionalStats.map((s) => s.first_prize_count)),
    [regionalStats],
  );
  const maxSecond = useMemo(
    () => Math.max(1, ...regionalStats.map((s) => s.second_prize_count)),
    [regionalStats],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 최근 핫스팟 트렌드 - design.txt 지시대로 최상단에 강조 배치 */}
      <HotspotTrendCard onPressSido={handleRegionPress} />

      {/* 최근 회차 당첨 현황 - "최근 회차"+"최근 회차 목록"을 하나로 통합, 상세는 아코디언 */}
      <RecentDrawSummary />

      {/* 지역별 명당 밀도(행운 지수) - 카드를 펼치면 자동/수동/반자동 비율도 함께 보임 */}
      <LuckDensityList onPressSido={handleRegionPress} />

      {/* 지역별 당첨 통계 (기존) */}
      <View style={styles.section}>
        <Pressable style={styles.sectionHeader} onPress={handleToggleRegionalStats}>
          <Text style={styles.sectionTitle}>지역별 당첨 통계</Text>
          <Text style={styles.statChevron}>{regionalStatsExpanded ? "▲" : "▼"}</Text>
        </Pressable>
        {regionalStatsExpanded &&
          (isLoadingRegional ? (
            <ActivityIndicator />
          ) : (
            <View>
              {regionalStats.map((stat) => (
                <RegionalStatRow
                  key={stat.sido || "기타"}
                  stat={stat}
                  maxFirst={maxFirst}
                  maxSecond={maxSecond}
                  onPress={handleRegionPress}
                />
              ))}
            </View>
          ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contentContainer: { padding: spacing.lg, gap: spacing.xl },
  section: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  statRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  statRegionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  statRegion: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  statRegionLink: { fontSize: 12, color: colors.primary, fontWeight: "600" },
  statChevron: { fontSize: 12, color: colors.textMuted },
  statBars: { gap: spacing.sm },
  statBar: { gap: spacing.xs },
  barFill: { height: 20, borderRadius: radius.sm },
  bar1st: { backgroundColor: colors.gold, width: "50%" },
  bar2nd: { backgroundColor: colors.silver, width: "30%" },
  barLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: numericFont.regular },
});
