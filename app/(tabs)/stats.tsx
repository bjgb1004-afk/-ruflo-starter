import { StyleSheet, Text, View, FlatList, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState, memo } from "react";
import {
  getLatestDraw,
  getRegionalStats,
  getDrawHistory,
  type RegionalStatsRow,
} from "@/features/draws/api/drawHistoryApi";
import type { DrawHistory } from "@/types/database.types";
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

const HistoryRow = memo(function HistoryRow({ item }: { item: DrawHistory }) {
  return (
    <View style={styles.historyRow}>
      <Text style={styles.historyNo}>{item.draw_no}회</Text>
      <Text style={styles.historyDate}>{item.draw_date}</Text>
      <Text style={styles.historyNumbers}>
        {item.winning_numbers.join(", ")} + {item.bonus_number}
      </Text>
    </View>
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

  const { data: latestDraw } = useQuery({
    queryKey: ["draws", "latest"],
    queryFn: getLatestDraw,
    staleTime: 1 * 60 * 1000, // 1분 캐시
    gcTime: 5 * 60 * 1000,
  });

  const { data: regionalStats = [], isLoading: isLoadingRegional } = useQuery({
    queryKey: ["stats", "regional"],
    queryFn: getRegionalStats,
    staleTime: 10 * 60 * 1000, // 10분 캐시 (변화가 적음)
    gcTime: 30 * 60 * 1000,
  });

  const { data: drawHistory = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["draws", "history"],
    queryFn: () => getDrawHistory(10),
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const renderHistory = useCallback(({ item }: { item: DrawHistory }) => <HistoryRow item={item} />, []);
  const historyKeyExtractor = useCallback((item: DrawHistory) => `${item.draw_no}`, []);

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
      {/* 최근 회차 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>최근 회차</Text>
        {latestDraw ? (
          <View style={styles.drawCard}>
            <Text style={styles.drawNo}>{latestDraw.draw_no}회</Text>
            <Text style={styles.drawDate}>{latestDraw.draw_date}</Text>
            <Text style={styles.winningNumbers}>
              {latestDraw.winning_numbers.join(", ")} + {latestDraw.bonus_number}
            </Text>
            {latestDraw.first_prize_winner_count !== null && (
              <View style={styles.prizeInfo}>
                <View style={styles.prizeRow}>
                  <Text style={styles.prizeLabel}>1등 당첨금</Text>
                  <Text style={styles.prizeValue}>
                    {latestDraw.first_prize_amount_per_win?.toLocaleString()}원
                  </Text>
                </View>
                <View style={styles.prizeRow}>
                  <Text style={styles.prizeLabel}>당첨자 수</Text>
                  <Text style={styles.prizeValue}>
                    {latestDraw.first_prize_winner_count}명
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          <ActivityIndicator />
        )}
      </View>

      {/* 지역별 당첨 통계 */}
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

      {/* 최근 회차 목록 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>최근 회차 목록</Text>
        {isLoadingHistory ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            scrollEnabled={false}
            data={drawHistory}
            keyExtractor={historyKeyExtractor}
            renderItem={renderHistory}
          />
        )}
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
  drawCard: {
    backgroundColor: colors.primaryLight,
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  drawNo: { fontSize: 26, fontWeight: "800", color: colors.primary, fontFamily: numericFont.bold },
  drawDate: { fontSize: 14, color: colors.textSecondary },
  winningNumbers: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: spacing.sm,
    fontFamily: numericFont.medium,
  },
  prizeInfo: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  prizeRow: { flexDirection: "row", justifyContent: "space-between" },
  prizeLabel: { fontSize: 13, color: colors.textSecondary },
  prizeValue: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, fontFamily: numericFont.medium },
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
  historyRow: {
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs + 2,
  },
  historyNo: { fontSize: 13, fontWeight: "700", color: colors.primary, fontFamily: numericFont.medium },
  historyDate: { fontSize: 12, color: colors.textMuted },
  historyNumbers: { fontSize: 12, color: colors.textPrimary, fontFamily: numericFont.regular },
});
