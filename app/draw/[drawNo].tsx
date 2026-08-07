import { StyleSheet, Text, View, FlatList, ActivityIndicator, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getDrawWinnersDetail, type DrawWinnerStore } from "@/features/draws/api/drawHistoryApi";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

type Row = DrawWinnerStore & { rank: 1 | 2 };

function formatDrawDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function DrawWinnersScreen() {
  const { drawNo } = useLocalSearchParams<{ drawNo: string }>();
  const router = useRouter();
  const drawNoNum = Number(drawNo);

  const { data, isLoading } = useQuery({
    queryKey: ["draws", drawNoNum, "winners-detail"],
    queryFn: () => getDrawWinnersDetail(drawNoNum),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: Number.isFinite(drawNoNum),
  });

  // "1등 전체 → 2등 전체" 순서로 하나의 리스트에 등수 배지와 함께 표시한다(limit/slice 없이 전체).
  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    return [
      ...data.firstPrizeStores.map((s) => ({ ...s, rank: 1 as const })),
      ...data.secondPrizeStores.map((s) => ({ ...s, rank: 2 as const })),
    ];
  }, [data]);

  const handlePressStore = useCallback(
    (storeId: string) => router.push(`/store/${storeId}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => (
      <Pressable style={styles.row} onPress={() => handlePressStore(item.storeId)}>
        <View style={[styles.badge, item.rank === 1 ? styles.badge1st : styles.badge2nd]}>
          <Text style={styles.badgeText}>{item.rank}등</Text>
        </View>
        <View style={styles.rowInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.storeName}>{item.storeName}</Text>
            {item.purchaseType && (
              <View style={styles.methodTag}>
                <Text style={styles.methodTagText}>{item.purchaseType}</Text>
              </View>
            )}
          </View>
          {item.address && (
            <Text style={styles.storeAddress} numberOfLines={1}>
              {item.address}
            </Text>
          )}
        </View>
      </Pressable>
    ),
    [handlePressStore],
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!data || rows.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>배출업소 정보가 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{data.drawNo}회 ({formatDrawDate(data.drawDate)})</Text>
        <Text style={styles.headerSubtitle}>
          1등 {data.firstPrizeStores.length}곳 · 2등 {data.secondPrizeStores.length}곳
        </Text>
        {(data.purchaseTypeSummary.자동 > 0 ||
          data.purchaseTypeSummary.수동 > 0 ||
          data.purchaseTypeSummary.반자동 > 0) && (
          <Text style={styles.methodSummary}>
            1등 구매방식 · 자동 {data.purchaseTypeSummary.자동}곳 · 수동 {data.purchaseTypeSummary.수동}곳
            {data.purchaseTypeSummary.반자동 > 0 ? ` · 반자동 ${data.purchaseTypeSummary.반자동}곳` : ""}
          </Text>
        )}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item, idx) => `${item.rank}-${item.storeId}-${idx}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.textMuted },
  header: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
    fontFamily: numericFont.bold,
  },
  headerSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  methodSummary: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  methodTag: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  methodTagText: { fontSize: 10, color: colors.textSecondary, fontWeight: "600" },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...cardShadow,
  },
  badge: {
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
  },
  badge1st: { backgroundColor: colors.gold },
  badge2nd: { backgroundColor: colors.silver },
  badgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  rowInfo: { flex: 1, gap: 2 },
  storeName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  storeAddress: { fontSize: 12, color: colors.textMuted },
});
