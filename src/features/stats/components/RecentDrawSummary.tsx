import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  getDrawByNo,
  getDrawWinnersDetail,
  getLatestDraw,
  type DrawWinnerStore,
} from "@/features/draws/api/drawHistoryApi";
import { Skeleton } from "@/components/Skeleton";
import { Dropdown } from "@/components/Dropdown";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

type Row = DrawWinnerStore & { rank: 1 | 2 };

const drawNoKey = (n: number) => String(n);
const drawNoLabel = (n: number) => `${n}회`;

// "회차별 당첨현황" - design.txt 요구사항대로 1회부터 최신 회차까지 드롭다운으로
// 아무 회차나 골라 조회할 수 있다(기본값은 최신 회차). 예전엔 최신 회차 고정 + "지난
// 회차 목록"이 별도였는데, 회차를 직접 골라 상세를 보는 게 가능해지면서 그 목록은
// 필요 없어져 없앴다.
export const RecentDrawSummary = memo(function RecentDrawSummary() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [selectedDrawNo, setSelectedDrawNo] = useState<number | null>(null);

  const { data: latestDraw, isLoading: isLoadingLatest } = useQuery({
    queryKey: ["draws", "latest"],
    queryFn: getLatestDraw,
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const effectiveDrawNo = selectedDrawNo ?? latestDraw?.draw_no ?? null;
  const isViewingLatest = !!latestDraw && effectiveDrawNo === latestDraw.draw_no;

  // 최신 회차는 이미 위 쿼리로 갖고 있으니 다시 요청하지 않고, 드롭다운으로 다른 회차를
  // 골랐을 때만 그 회차 정보를 새로 가져온다.
  const { data: pickedDraw, isLoading: isLoadingPicked } = useQuery({
    queryKey: ["draws", effectiveDrawNo],
    queryFn: () => getDrawByNo(effectiveDrawNo!),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!effectiveDrawNo && !isViewingLatest,
  });

  const activeDraw = isViewingLatest ? latestDraw : pickedDraw;

  const { data: detail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ["draws", effectiveDrawNo, "winners-detail"],
    queryFn: () => getDrawWinnersDetail(effectiveDrawNo!),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!effectiveDrawNo,
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

  const drawOptions = useMemo(() => {
    if (!latestDraw) return [];
    const list: number[] = [];
    for (let n = latestDraw.draw_no; n >= 1; n--) list.push(n);
    return list;
  }, [latestDraw]);

  const handleToggle = useCallback(() => setExpanded((v) => !v), []);
  const handlePressStore = useCallback((storeId: string) => router.push(`/store/${storeId}`), [router]);
  const handleSelectDraw = useCallback((n: number) => {
    setSelectedDrawNo(n);
    setExpanded(false);
  }, []);

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
      <View style={styles.headerRow}>
        <Text style={styles.title}>회차별 당첨현황</Text>
        <Dropdown
          placeholder="회차 선택"
          value={effectiveDrawNo}
          options={drawOptions}
          getKey={drawNoKey}
          getLabel={drawNoLabel}
          onSelect={handleSelectDraw}
        />
      </View>

      {!activeDraw || (isLoadingPicked && !isViewingLatest) ? (
        <Skeleton height={60} />
      ) : (
        <>
          <Text style={styles.date}>{activeDraw.draw_date}</Text>
          <Text style={styles.numbers}>
            {activeDraw.winning_numbers.join(", ")} + {activeDraw.bonus_number}
          </Text>

          {activeDraw.first_prize_winner_count !== null && (
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>1등 당첨자</Text>
                <Text style={styles.summaryValue}>{activeDraw.first_prize_winner_count}명</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>1등 당첨금</Text>
                <Text style={styles.summaryValue}>
                  {activeDraw.first_prize_amount_per_win?.toLocaleString() ?? "-"}원
                </Text>
              </View>
            </View>
          )}
        </>
      )}

      {summary && (summary.자동 > 0 || summary.수동 > 0 || summary.반자동 > 0) && (
        <Text style={styles.methodSummary}>
          구매방식(확인분) · 자동 {summary.자동}곳 · 수동 {summary.수동}곳
          {summary.반자동 > 0 ? ` · 반자동 ${summary.반자동}곳` : ""}
        </Text>
      )}

      {highlightSidos.length > 0 && (
        <View style={styles.highlightRow}>
          <Text style={styles.highlightLabel}>🎉 1등 배출 지역</Text>
          <Text style={styles.highlightValue}>{highlightSidos.join(" · ")}</Text>
        </View>
      )}

      <Pressable style={styles.toggleButton} onPress={handleToggle}>
        <Text style={styles.toggleButtonText}>
          당첨 판매점 전체보기{totalStoreCount > 0 ? ` (${totalStoreCount}곳)` : ""}
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
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
});
