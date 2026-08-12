import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  getDrawWinnersDetail,
  getLatestDraw,
  type DrawWinnerStore,
} from "@/features/draws/api/drawHistoryApi";
import { useDrawByNo } from "@/features/draws/useDrawByNo";
import { Skeleton } from "@/components/Skeleton";
import { Dropdown } from "@/components/Dropdown";
import { LottoBall } from "@/components/LottoBall";
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

  const {
    data: latestDraw,
    isLoading: isLoadingLatest,
    isError: isLatestDrawError,
    refetch: refetchLatestDraw,
  } = useQuery({
    queryKey: ["draws", "latest"],
    queryFn: getLatestDraw,
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const effectiveDrawNo = selectedDrawNo ?? latestDraw?.draw_no ?? null;
  const isViewingLatest = !!latestDraw && effectiveDrawNo === latestDraw.draw_no;

  // 최신 회차는 이미 위 쿼리로 갖고 있으니 다시 요청하지 않고, 드롭다운으로 다른 회차를
  // 골랐을 때만 그 회차 정보를 새로 가져온다.
  const { data: pickedDraw, isLoading: isLoadingPicked } = useDrawByNo(effectiveDrawNo, {
    enabled: !isViewingLatest,
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

  // 배출업소 데이터는 별도 공공데이터 소스라 당첨번호보다 반영이 여러 날 늦을 수 있다.
  // 최근 3일 이내 회차인데 목록이 비어 있으면 "정보 없음"이 아니라 "집계 중"으로 안내한다.
  const isRecentDraw = activeDraw
    ? Date.now() - new Date(activeDraw.draw_date).getTime() < 3 * 24 * 60 * 60 * 1000
    : false;

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

  // 추첨 직후(토 20:40~21:00경) 트래픽 급증으로 조회가 실패해도 재시도만 1회 하고 끝나면
  // 화면이 스켈레톤에 무한정 멈춰 있는 것처럼 보인다 - 실패로 확정되면 안내와 재시도 버튼을 보여준다.
  if (isLatestDrawError) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>당첨번호를 불러오지 못했어요. 접속이 몰리는 시간일 수 있어요.</Text>
        <Pressable style={styles.retryButton} onPress={() => refetchLatestDraw()}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

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
        {/* 화면 상단 헤더 제목이 이미 "회차별 당첨현황"이라 카드 안에서 또 반복하지
            않고, 이 카드가 구체적으로 뭘 보여주는지로 다르게 적는다. */}
        <Text style={styles.title}>당첨번호 조회</Text>
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
          <View style={styles.ballsRow}>
            {activeDraw.winning_numbers.map((num) => (
              <LottoBall key={num} number={num} size="small" />
            ))}
            <Text style={styles.plusSign}>+</Text>
            <LottoBall number={activeDraw.bonus_number} isBonus size="small" />
          </View>

          {/* 추첨 직후(토 20:35~21:10경)엔 당첨번호는 먼저 나오지만 당첨금 집계는
              몇 분~몇십 분 뒤에야 채워진다. 이 구간엔 블록 자체를 숨기지 않고
              "집계 중"임을 명시해, 빈 화면이나 이상한 값(0원 등)으로 오해하지 않게 한다. */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>1등 당첨자</Text>
              <Text style={styles.summaryValue}>
                {activeDraw.first_prize_winner_count !== null
                  ? `${activeDraw.first_prize_winner_count}명`
                  : "집계 중..."}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>1등 당첨금</Text>
              <Text style={styles.summaryValue}>
                {activeDraw.first_prize_amount_per_win !== null
                  ? `${activeDraw.first_prize_amount_per_win.toLocaleString()}원`
                  : "집계 중..."}
              </Text>
            </View>
          </View>
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
            <Text style={styles.emptyText}>
              {isRecentDraw ? "배출업소 정보를 집계 중이에요. 잠시 후 다시 확인해 주세요." : "배출업소 정보가 없어요."}
            </Text>
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
  // 6개 숫자 공 + "+" + 보너스 공까지 한 줄에 딱 맞아야 해서(줄바꿈되면 카드가 어색하게
  // 늘어남) 공 크기를 small로, 간격도 좁게(justifyContent: space-between으로 카드 폭에
  // 맞춰 균등 분배) 잡는다. flexWrap은 혹시라도 더 좁은 화면에서 넘칠 때의 안전장치로 유지.
  ballsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    flexWrap: "wrap",
  },
  plusSign: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
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
  errorText: { fontSize: 13, color: colors.textSecondary, textAlign: "center" },
  retryButton: {
    alignSelf: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  retryButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
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
