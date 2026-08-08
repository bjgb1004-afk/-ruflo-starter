import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Share,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, memo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getStoreWithStats } from "@/features/stores/api/storesApi";
import {
  getWinningsByStore,
  getLatestFirstPrizeWinners,
  getPurchaseMethodsForStore,
} from "@/features/draws/api/drawHistoryApi";
import { openDirections } from "@/features/stores/utils/openDirections";
import { openNearbySearch } from "@/features/stores/utils/openNearbySearch";
import { toLuckyIndex, toStarRating, starRatingText, computeSmartBadges } from "@/features/stores/utils/luckyIndex";
import { useFavorites } from "@/features/favorites/useFavorites";
import { useRecentlyViewed } from "@/features/favorites/useRecentlyViewed";
import { useAuth } from "@/features/auth/useAuth";
import { formatPhoneNumber } from "@/utils/formatPhoneNumber";
import type { StoreWinningRow } from "@/types/database.types";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_NAMES: Record<string, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};

// 요일이 7줄로 늘어지지 않도록, 연속된 요일 중 영업시간이 같은 것끼리 묶어서
// "월~금 09:00~22:00, 토~일 10:00~20:00" 처럼 한 줄(또는 몇 줄)로 요약한다.
function summarizeBusinessHours(hours: Record<string, string>): string {
  const entries = DAY_ORDER.filter((d) => hours[d]).map((d) => ({ day: d, time: hours[d] }));
  if (entries.length === 0) return "";

  const groups: { start: (typeof DAY_ORDER)[number]; end: (typeof DAY_ORDER)[number]; time: string }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.time === entry.time && DAY_ORDER.indexOf(last.end) + 1 === DAY_ORDER.indexOf(entry.day)) {
      last.end = entry.day;
    } else {
      groups.push({ start: entry.day, end: entry.day, time: entry.time });
    }
  }

  if (groups.length === 1 && groups[0].start === "mon" && groups[0].end === "sun") {
    return `매일 ${groups[0].time}`;
  }

  return groups
    .map((g) => {
      const label = g.start === g.end ? DAY_NAMES[g.start] : `${DAY_NAMES[g.start]}~${DAY_NAMES[g.end]}`;
      return `${label} ${g.time}`;
    })
    .join(", ");
}

const WinningRow = memo(function WinningRow({
  item,
  purchaseType,
}: {
  item: StoreWinningRow;
  purchaseType?: string;
}) {
  return (
    <View style={styles.winRow}>
      <View style={styles.winInfo}>
        <View style={styles.winDrawRow}>
          <Text style={styles.winDraw}>{item.draw_no}회</Text>
          {purchaseType && (
            <View style={styles.methodTag}>
              <Text style={styles.methodTagText}>{purchaseType}</Text>
            </View>
          )}
        </View>
        <Text style={styles.winDate}>{item.draw_date}</Text>
      </View>
      <View style={[styles.winBadge, item.rank === 1 ? styles.winBadge1st : styles.winBadge2nd]}>
        <Text
          style={[
            styles.winBadgeText,
            item.rank === 1 ? styles.winBadgeText1st : styles.winBadgeText2nd,
          ]}
        >
          {item.rank}등
        </Text>
      </View>
    </View>
  );
});

export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // 안드로이드 엣지투엣지에서 스크롤 맨 아래 내용이 시스템 네비게이션 바에 가려지는
  // 문제 - 앱 전체 점검(design.txt) 결과 이 화면도 해당돼 하단 안전영역 여백을 더한다.
  const insets = useSafeAreaInsets();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["store", id, "stats"],
    queryFn: () => getStoreWithStats(id!),
    staleTime: 5 * 60 * 1000, // 5분 캐시
    gcTime: 10 * 60 * 1000,
    enabled: !!id,
  });

  const { data: winnings = [] } = useQuery({
    queryKey: ["store", id, "winnings"],
    queryFn: () => getWinningsByStore(id!),
    staleTime: 10 * 60 * 1000, // 10분 (자주 변하지 않음)
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
  });

  // 1등 당첨 회차 중 구매 방식(자동/수동/반자동)이 pyony.com에서 확인된 회차만 태그로 표시.
  const { data: purchaseMethods } = useQuery({
    queryKey: ["store", id, "purchase-methods"],
    queryFn: () => getPurchaseMethodsForStore(id!),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
  });

  // 홈 화면 배너와 같은 쿼리키를 써서 캐시를 재사용한다 (같은 세션에서 홈을 먼저
  // 봤으면 재요청 없이 바로 사용됨).
  const { data: latestWinners } = useQuery({
    queryKey: ["draws", "latest-winners"],
    queryFn: getLatestFirstPrizeWinners,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const renderWinning = useCallback(
    ({ item }: { item: StoreWinningRow }) => (
      <WinningRow item={item} purchaseType={item.rank === 1 ? purchaseMethods?.get(item.draw_no) : undefined} />
    ),
    [purchaseMethods],
  );
  const winningKeyExtractor = useCallback(
    (item: StoreWinningRow, idx: number) => `${item.draw_no}-${idx}`,
    [],
  );

  const isFavorite = useFavorites((s) => !!s.stores[id!]);
  const toggleFavorite = useFavorites((s) => s.toggle);
  const userId = useAuth((s) => s.user?.id);
  const addRecentView = useRecentlyViewed((s) => s.addView);

  useEffect(() => {
    if (!stats || !id) return;
    addRecentView({ id, name: stats.name, address: stats.address });
    // stats 객체가 매 렌더마다 새로 생성되므로 name/address만 의존성으로 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, stats?.name, stats?.address]);

  const handleShare = useCallback(() => {
    if (!stats) return;
    Share.share({
      message: `${stats.name}\n${stats.address}\n\n로또맵에서 확인하세요 🍀`,
    });
  }, [stats]);

  const handleNearbySearch = useCallback(
    (keyword: string) => {
      if (stats?.latitude == null || stats?.longitude == null) return;
      openNearbySearch(stats.latitude, stats.longitude, keyword);
    },
    [stats],
  );

  const formattedPhone = formatPhoneNumber(stats?.phone);

  const handleShowScoreInfo = useCallback(() => {
    Alert.alert(
      "명당지수란?",
      "최근 1년 1등 배출 수 × 50점 + 최근 1년 2등 배출 수 × 10점 + 누적 1등 배출 수 × 5점을 더한 값을 0~100점으로 환산했어요. 최근 실적과 꾸준함을 함께 반영합니다.",
    );
  }, []);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={styles.center}>
        <Text>판매점을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.xl + insets.bottom }]}
    >
      {/* 상점 정보 헤더 */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{stats.name}</Text>
          <Pressable
            hitSlop={8}
            onPress={() => toggleFavorite({ id: id!, name: stats.name, address: stats.address }, userId)}
          >
            <Text style={styles.favoriteIcon}>{isFavorite ? "⭐" : "☆"}</Text>
          </Pressable>
        </View>
        <Text style={styles.address}>{stats.address}</Text>
        <View style={styles.headerActions}>
          <Pressable
            disabled={!formattedPhone}
            onPress={() => formattedPhone && Linking.openURL(`tel:${formattedPhone}`)}
          >
            <Text style={[styles.phone, !formattedPhone && styles.phoneDisabled]}>
              {formattedPhone ? `📞 ${formattedPhone}` : "전화번호 정보 없음"}
            </Text>
          </Pressable>
          {stats.latitude != null && stats.longitude != null && (
            <Pressable
              style={styles.directionsButton}
              onPress={() => openDirections(stats.latitude!, stats.longitude!, stats.name)}
            >
              <Text style={styles.directionsButtonText}>🗺️ 길찾기</Text>
            </Pressable>
          )}
          <Pressable style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>📤 공유</Text>
          </Pressable>
        </View>
      </View>

      {/* 평점 및 리뷰 */}
      {(stats as any).rating > 0 && (
        <View style={styles.ratingSection}>
          <View style={styles.ratingCard}>
            <Text style={styles.ratingValue}>⭐ {((stats as any).rating).toFixed(1)}</Text>
            <Text style={styles.ratingCount}>리뷰 {(stats as any).review_count}개</Text>
          </View>
          {(stats as any).latest_review && (
            <Text style={styles.latestReview}>💬 "{(stats as any).latest_review}"</Text>
          )}
        </View>
      )}

      {/* 편의시설 정보 - 매장 자체 정보가 없어도 항상 동일한 레이아웃으로 표시하고,
          주변 시설 찾기 버튼은 자체 API 연동 없이 지도 앱 검색으로 위임한다. */}
      <View style={styles.amenitiesSection}>
        <Text style={styles.sectionTitle}>편의시설</Text>
        {(stats as any).has_parking ||
        (stats as any).has_restroom ||
        (stats as any).has_atm ||
        (stats as any).amenities?.length > 0 ? (
          <View style={styles.amenitiesGrid}>
            {(stats as any).has_parking && (
              <View style={styles.amenityTag}>
                <Text style={styles.amenityIcon}>🅿️</Text>
                <Text style={styles.amenityText}>주차</Text>
              </View>
            )}
            {(stats as any).has_restroom && (
              <View style={styles.amenityTag}>
                <Text style={styles.amenityIcon}>🚻</Text>
                <Text style={styles.amenityText}>화장실</Text>
              </View>
            )}
            {(stats as any).has_atm && (
              <View style={styles.amenityTag}>
                <Text style={styles.amenityIcon}>💳</Text>
                <Text style={styles.amenityText}>ATM</Text>
              </View>
            )}
            {(stats as any).amenities?.map((amenity: string, idx: number) => (
              <View key={idx} style={styles.amenityTag}>
                <Text style={styles.amenityText}>{amenity}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.amenitiesEmptyText}>등록된 편의시설 정보가 아직 없어요.</Text>
        )}

        {stats.latitude != null && stats.longitude != null && (
          <View style={styles.nearbySearchRow}>
            {[
              { keyword: "화장실", icon: "🚻" },
              { keyword: "ATM", icon: "💳" },
              { keyword: "편의점", icon: "🏪" },
              { keyword: "카페", icon: "☕" },
            ].map((item) => (
              <Pressable
                key={item.keyword}
                style={styles.nearbySearchButton}
                onPress={() => handleNearbySearch(item.keyword)}
              >
                <Text style={styles.nearbySearchButtonText}>
                  {item.icon} 주변 {item.keyword}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* 영업시간 */}
      {(stats as any).business_hours && (
        <View style={styles.businessHoursSection}>
          <Text style={styles.sectionTitle}>영업시간</Text>
          <Text style={styles.businessHoursSummary}>
            {summarizeBusinessHours((stats as any).business_hours as Record<string, string>)}
          </Text>
        </View>
      )}

      {/* 점수 및 순위 */}
      <View style={styles.scoreSection}>
        <View style={styles.scoreCard}>
          <Pressable style={styles.scoreLabelRow} onPress={handleShowScoreInfo} hitSlop={8}>
            <Text style={styles.scoreLabel}>명당지수</Text>
            <Text style={styles.scoreInfoIcon}>ⓘ</Text>
          </Pressable>
          <Text style={styles.scoreValue}>{toLuckyIndex(stats.store_score)}</Text>
          <Text style={styles.scoreStars}>{starRatingText(toStarRating(toLuckyIndex(stats.store_score)))}</Text>
          {winnings[0] && (
            <Text style={styles.scoreRecentWin}>
              📅 최근 당첨 {winnings[0].draw_date.slice(0, 7).replace("-", ".")}
            </Text>
          )}
        </View>
        <View style={styles.rankGrid}>
          <View style={styles.rankCell}>
            <Text style={styles.rankLabel}>전국</Text>
            <Text style={styles.rankValue}>{stats.nation_rank ?? "-"}위</Text>
          </View>
          <View style={styles.rankCell}>
            <Text style={styles.rankLabel}>시도</Text>
            <Text style={styles.rankValue}>{stats.province_rank ?? "-"}위</Text>
          </View>
          <View style={styles.rankCell}>
            <Text style={styles.rankLabel}>시군구</Text>
            <Text style={styles.rankValue}>{stats.city_rank ?? "-"}위</Text>
          </View>
        </View>
        {(() => {
          const badges = computeSmartBadges({
            nationRank: stats.nation_rank,
            isRecentWinner: (latestWinners?.stores ?? []).some((w) => w.storeId === id),
            first_prize_1yr: stats.first_prize_1yr,
            first_prize_count: stats.first_prize_count,
          });
          if (badges.length === 0) return null;
          return (
            <View style={styles.smartBadgeRow}>
              {badges.map((b) => (
                <View key={b.key} style={styles.smartBadge}>
                  <Text style={styles.smartBadgeText}>
                    {b.emoji} {b.label}
                  </Text>
                </View>
              ))}
            </View>
          );
        })()}
      </View>

      {/* 당첨 통계 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>당첨 통계</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>1등 배출</Text>
            <Text style={styles.statCount}>{stats.first_prize_count}</Text>
            <Text style={styles.statUnit}>회</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>2등 배출</Text>
            <Text style={styles.statCount}>{stats.second_prize_count}</Text>
            <Text style={styles.statUnit}>회</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>1년 내 1등</Text>
            <Text style={styles.statCount}>{stats.first_prize_1yr}</Text>
            <Text style={styles.statUnit}>회</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>5년 내 1등</Text>
            <Text style={styles.statCount}>{stats.first_prize_5yr}</Text>
            <Text style={styles.statUnit}>회</Text>
          </View>
        </View>
        <Text style={styles.statsFootnote}>
          * 1년/5년 당첨 통계는 최신 당첨 데이터 업데이트가 반영된 결과입니다.
        </Text>
      </View>

      {/* 최근 당첨 이력 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>최근 당첨 이력</Text>
        {winnings.length === 0 ? (
          <Text style={styles.emptyText}>당첨 이력이 없습니다.</Text>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={winnings}
            keyExtractor={winningKeyExtractor}
            renderItem={renderWinning}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.lg, gap: spacing.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  favoriteIcon: { fontSize: 22, color: colors.gold },
  address: { fontSize: 14, color: colors.textSecondary },
  phone: { fontSize: 14, color: colors.primary, fontWeight: "600" },
  phoneDisabled: { color: colors.textMuted },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  directionsButton: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
  },
  directionsButtonText: { fontSize: 13, color: colors.primary, fontWeight: "700" },
  shareButton: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
  },
  shareButtonText: { fontSize: 13, color: colors.textSecondary, fontWeight: "700" },
  scoreSection: { gap: spacing.md },
  scoreCard: {
    backgroundColor: colors.primaryLight,
    padding: spacing.lg,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  scoreLabelRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.xs },
  scoreLabel: { fontSize: 12, color: colors.textSecondary },
  scoreInfoIcon: { fontSize: 12, color: colors.textMuted, fontWeight: "700" },
  scoreValue: { fontSize: 34, fontWeight: "800", color: colors.primary, fontFamily: numericFont.bold },
  scoreStars: { fontSize: 16, color: colors.goldBright, marginTop: 2, letterSpacing: 2 },
  scoreRecentWin: { fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
  smartBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  smartBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smartBadgeText: { fontSize: 12, fontWeight: "600", color: colors.textPrimary },
  rankGrid: { flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  rankCell: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    ...cardShadow,
  },
  rankLabel: { fontSize: 12, color: colors.textMuted },
  rankValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: spacing.xs,
    fontFamily: numericFont.bold,
  },
  section: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  statItem: {
    width: "48%",
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  statLabel: { fontSize: 12, color: colors.textSecondary },
  statCount: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: spacing.xs,
    fontFamily: numericFont.bold,
  },
  statUnit: { fontSize: 12, color: colors.textMuted },
  statsFootnote: { fontSize: 11, color: colors.textMuted, lineHeight: 16, marginTop: spacing.xs },
  emptyText: { color: colors.textMuted, textAlign: "center", paddingVertical: spacing.lg },
  winRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  winInfo: { gap: spacing.xs },
  winDrawRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  winDraw: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, fontFamily: numericFont.medium },
  methodTag: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  methodTagText: { fontSize: 10, color: colors.textSecondary, fontWeight: "600" },
  winDate: { fontSize: 12, color: colors.textMuted },
  winBadge: { paddingHorizontal: spacing.md - 2, paddingVertical: spacing.sm - 2, borderRadius: radius.pill },
  winBadge1st: { backgroundColor: colors.gold },
  winBadge2nd: { backgroundColor: colors.silver },
  winBadgeText: { fontWeight: "700", fontSize: 12 },
  winBadgeText1st: { color: "#fff" },
  winBadgeText2nd: { color: "#fff" },

  // 평점 및 리뷰
  ratingSection: { gap: spacing.md },
  ratingCard: {
    backgroundColor: colors.goldLight,
    padding: spacing.lg,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  ratingValue: { fontSize: 24, fontWeight: "800", color: colors.gold, fontFamily: numericFont.bold },
  ratingCount: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  latestReview: { fontSize: 13, color: colors.textSecondary, fontStyle: "italic", lineHeight: 20 },

  // 편의시설
  amenitiesSection: { gap: spacing.md },
  amenitiesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  amenityTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    gap: spacing.xs + 2,
  },
  amenityIcon: { fontSize: 14 },
  amenityText: { fontSize: 12, color: colors.primaryDark, fontWeight: "600" },
  amenitiesEmptyText: { fontSize: 13, color: colors.textMuted },
  nearbySearchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  nearbySearchButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  nearbySearchButtonText: { fontSize: 12, color: colors.textPrimary, fontWeight: "600" },

  // 영업시간
  businessHoursSection: { gap: spacing.md },
  businessHoursSummary: {
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: radius.sm,
    lineHeight: 20,
  },
});
