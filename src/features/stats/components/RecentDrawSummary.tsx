import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  getDrawHistory,
  getDrawWinnersDetail,
  getLatestDraw,
  type DrawWinnerStore,
} from "@/features/draws/api/drawHistoryApi";
import { Skeleton } from "@/components/Skeleton";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

type Row = DrawWinnerStore & { rank: 1 | 2 };

// design.txt "최근 회차 + 최근 회차 목록 통합" - 기본은 요약만 보이고, 버튼을 눌러야
// 전체 배출업소 아코디언이 펼쳐진다(getDrawWinnersDetail은 펼치기 전엔 요청하지 않음).
export const RecentDrawSummary = memo(function RecentDrawSummary() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  // "지역별 당첨 통계" 섹션을 없애면서, 거기 딸려 있던 것과는 별개로 예전 "최근 회차 목록"
  // (회차별 당첨번호 이력)이 사라졌다는 피드백 - 당첨현황판 안에 두 번째 아코디언으로
  // 되살린다. 배출업소 목록과는 다른 데이터라 별도 토글/쿼리로 분리한다.
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const { data: latestDraw, isLoading: isLoadingLatest } = useQuery({
    queryKey: ["draws", "latest"],
    queryFn: getLatestDraw,
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // 하이라이트(주요 배출 지역/구매방식 요약)와 아코디언 전체목록이 같은 데이터를 쓰므로
  // 접기/펼치기와 무관하게 한 번만 조회한다(latestDraw만 알면 바로 요청, expanded로 게이팅 안 함).
  const { data: detail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ["draws", latestDraw?.draw_no, "winners-detail"],
    queryFn: () => getDrawWinnersDetail(latestDraw!.draw_no),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!latestDraw,
  });

  const highlightSidos = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of detail?.firstPrizeStores ?? []) {
      if (s.sido && !seen.has(s.sido)) {
        seen.add(s.sido);
        list.push(s.sido);
      }
      if (list.length >= 3) break;
    }
    return list;
  }, [detail]);

  const rows = useMemo<Row[]>(() => {
    if (!detail) return [];
    return [
      ...detail.firstPrizeStores.map((s) => ({ ...s, rank: 1 as const })),
      ...detail.secondPrizeStores.map((s) => ({ ...s, rank: 2 as const })),
    ];
  }, [detail]);

  const totalStoreCount = (detail?.firstPrizeStores.length ?? 0) + (detail?.secondPrizeStores.length ?? 0);

  const { data: drawHistory = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["draws", "history"],
    queryFn: () => getDrawHistory(20),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: historyExpanded,
  });

  const handleToggle = useCallback(() => setExpanded((v) => !v), []);
  const handleToggleHistory = useCallback(() => setHistoryExpanded((v) => !v), []);
  const handlePressStore = useCallback((storeId: string) => router.push(`/store/${storeId}`), [router]);

  if (isLoadingLatest || !latestDraw) {
    return (
      <View style={styles.card}>
        <Skeleton height={24} width="60%" />
        <Skeleton height={60} />
      </View>
    );
  }

  const summary = detail?.purchaseTypeSummary;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{latestDraw.draw_no}회 당첨 현황</Text>
      <Text style={styles.date}>{latestDraw.draw_date}</Text>
      <Text style={styles.numbers}>
        {latestDraw.winning_numbers.join(", ")} + {latestDraw.bonus_number}
      </Text>

      {latestDraw.first_prize_winner_count !== null && (
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>1등 당첨자</Text>
            <Text style={styles.summaryValue}>{latestDraw.first_prize_winner_count}명</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>1등 당첨금</Text>
            <Text style={styles.summaryValue}>
              {latestDraw.first_prize_amount_per_win?.toLocaleString() ?? "-"}원
            </Text>
          </View>
        </View>
      )}

      {summary && (summary.자동 > 0 || summary.수동 > 0 || summary.반자동 > 0) && (
        <Text style={styles.methodSummary}>
          구매방식(확인분) · 자동 {summary.자동}곳 · 수동 {summary.수동}곳
          {summary.반자동 > 0 ? ` · 반자동 ${summary.반자동}곳` : ""}
        </Text>
      )}

      {highlightSidos.length > 0 && (
        <View style={styles.highlightRow}>
          <Text style={styles.highlightLabel}>🎉 이번 회차 1등 배출 지역</Text>
          <Text style={styles.highlightValue}>{highlightSidos.join(" · ")}</Text>
        </View>
      )}

      <Pressable style={styles.toggleButton} onPress={handleToggle}>
        <Text style={styles.toggleButtonText}>
          이번 회차 당첨 판매점 전체보기{totalStoreCount > 0 ? ` (${totalStoreCount}곳)` : ""}
        </Text>
        <Text style={styles.toggleChevron}>{expanded ? "▲" : "▼"}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.accordion}>
          {isLoadingDetail ? (
            <View style={styles.skeletonWrap}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={48} />
              ))}
            </View>
          ) : rows.length === 0 ? (
            <Text style={styles.emptyText}>배출업소 정보가 없어요.</Text>
          ) : (
            rows.map((item, idx) => (
              <Pressable
                key={`${item.rank}-${item.storeId}-${idx}`}
                style={styles.storeRow}
                onPress={() => handlePressStore(item.storeId)}
              >
                <View style={[styles.storeBadge, item.rank === 1 ? styles.storeBadge1st : styles.storeBadge2nd]}>
                  <Text style={styles.storeBadgeText}>{item.rank}등</Text>
                </View>
                <View style={styles.storeInfo}>
                  <Text style={styles.storeName}>{item.storeName}</Text>
                  {item.address && (
                    <Text style={styles.storeAddress} numberOfLines={1}>
                      {item.address}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}

      <Pressable style={styles.toggleButton} onPress={handleToggleHistory}>
        <Text style={styles.toggleButtonText}>지난 회차 당첨번호 보기</Text>
        <Text style={styles.toggleChevron}>{historyExpanded ? "▲" : "▼"}</Text>
      </Pressable>

      {historyExpanded && (
        <View style={styles.accordion}>
          {isLoadingHistory ? (
            <View style={styles.skeletonWrap}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={40} />
              ))}
            </View>
          ) : (
            drawHistory.map((d) => (
              <View key={d.draw_no} style={styles.historyRow}>
                <View style={styles.historyMeta}>
                  <Text style={styles.historyDraw}>{d.draw_no}회</Text>
                  <Text style={styles.historyDate}>{d.draw_date}</Text>
                </View>
                <Text style={styles.historyNumbers}>
                  {d.winning_numbers.join(", ")} + {d.bonus_number}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, fontFamily: numericFont.bold },
  date: { fontSize: 13, color: colors.textSecondary },
  numbers: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, marginTop: spacing.xs, fontFamily: numericFont.medium },
  summaryGrid: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryItem: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  summaryLabel: { fontSize: 11, color: colors.textSecondary },
  summaryValue: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 2, fontFamily: numericFont.medium },
  methodSummary: { fontSize: 12, color: colors.textMuted },
  highlightRow: { gap: 2 },
  highlightLabel: { fontSize: 12, color: colors.textSecondary },
  highlightValue: { fontSize: 13, fontWeight: "700", color: colors.primary },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  toggleButtonText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  toggleChevron: { fontSize: 12, color: colors.textMuted },
  accordion: { gap: spacing.sm, marginTop: spacing.xs },
  skeletonWrap: { gap: spacing.sm },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.md },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  storeBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  storeBadge1st: { backgroundColor: colors.gold },
  storeBadge2nd: { backgroundColor: colors.silver },
  storeBadgeText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  storeInfo: { flex: 1, gap: 1 },
  storeName: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  storeAddress: { fontSize: 11, color: colors.textMuted },
  historyRow: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    gap: 2,
  },
  historyMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  historyDraw: { fontSize: 13, fontWeight: "700", color: colors.primary, fontFamily: numericFont.medium },
  historyDate: { fontSize: 11, color: colors.textMuted },
  historyNumbers: { fontSize: 12, color: colors.textPrimary, fontFamily: numericFont.regular },
});
