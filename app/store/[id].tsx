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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, memo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStoreWithStats } from "@/features/stores/useStoreWithStats";
import { useResponsive, getResponsiveSpacing, getResponsiveFontSize } from "@/utils/responsive";
import {
  getWinningsByStore,
  getLatestFirstPrizeWinners,
  getPurchaseMethodsForStore,
} from "@/features/draws/api/drawHistoryApi";
import { openDirections } from "@/features/stores/utils/openDirections";
import { openNearbySearch } from "@/features/stores/utils/openNearbySearch";
import { useFavorites } from "@/features/favorites/useFavorites";
import { useRecentlyViewed } from "@/features/favorites/useRecentlyViewed";
import { useAuth } from "@/features/auth/useAuth";
import { useSelectedStores } from "@/features/geofencing/useSelectedStores";
import { GEOFENCE_FREE_TIER_MAX } from "@/constants/config";
import { formatPhoneNumber } from "@/utils/formatPhoneNumber";
import { getStoreOwnerProfile } from "@/features/storeOwner/api/storeOwnerApi";
import { resolvePhone, resolveOwnerMessage } from "@/features/storeOwner/resolveDisplayInfo";
import { OwnershipTransferBanner } from "@/features/storeOwner/components/OwnershipTransferBanner";
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
  const router = useRouter();
  const { breakpoint } = useResponsive();
  // 안드로이드 엣지투엣지에서 스크롤 맨 아래 내용이 시스템 네비게이션 바에 가려지는
  // 문제 - 앱 전체 점검(design.txt) 결과 이 화면도 해당돼 하단 안전영역 여백을 더한다.
  const insets = useSafeAreaInsets();

  // 최근 당첨 이력 접기/펼치기 - 기본값은 접음
  const [winningsExpanded, setWinningsExpanded] = useState(false);

  const { data: stats, isLoading } = useStoreWithStats(id);

  const { data: winnings = [] } = useQuery({
    queryKey: ["store", id, "winnings"],
    queryFn: () => getWinningsByStore(id!),
    staleTime: 10 * 60 * 1000, // 10분 (자주 변하지 않음)
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
  });

  const { data: ownerProfile } = useQuery({
    queryKey: ["store", id, "owner-profile"],
    queryFn: () => getStoreOwnerProfile(id!),
    staleTime: 60 * 1000,
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

  const isSelected = useSelectedStores((s) => !!s.stores[id!]);
  const toggle = useSelectedStores((s) => s.toggle);

  useEffect(() => {
    if (!stats || !id) return;
    addRecentView({ id, name: stats.name, address: stats.address });
    // stats 객체가 매 렌더마다 새로 생성되므로 name/address만 의존성으로 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, stats?.name, stats?.address]);

  const handleShare = useCallback(() => {
    if (!stats) return;
    Share.share({
      message: `${stats.name}\n${stats.address}\n\n복권명당에서 확인하세요 🍀`,
    });
  }, [stats]);

  const handleNearbySearch = useCallback(
    (keyword: string) => {
      if (stats?.latitude == null || stats?.longitude == null) return;
      openNearbySearch(stats.latitude, stats.longitude, keyword);
    },
    [stats],
  );

  const formattedPhone = formatPhoneNumber(resolvePhone(ownerProfile?.phone, stats?.phone));
  const ownerMessage = resolveOwnerMessage(ownerProfile?.owner_message);
  const ownerBusinessHoursText = ownerProfile?.business_hours?.trim();
  const isOwner = !!userId && ownerProfile?.owner_user_id === userId;
  // 사장님이 입력한 값이 있으면 우선, 없으면(또는 아직 입력 안 해 null이면) 기존 stores 값으로 폴백.
  const displayHasParking = ownerProfile?.has_parking ?? (stats as any)?.has_parking;
  const displayHasRestroom = ownerProfile?.has_restroom ?? (stats as any)?.has_restroom;
  const displayHasAtm = ownerProfile?.has_atm ?? (stats as any)?.has_atm;
  const displayAmenities: string[] = ownerProfile?.amenities ?? (stats as any)?.amenities ?? [];

  const handleShowScoreInfo = useCallback(() => {
    Alert.alert(
      "명당지수란?",
      "최근 1년 1등 배출 수 × 50점 + 최근 1년 2등 배출 수 × 10점 + 누적 1등 배출 수 × 5점을 더한 값을 0~100점으로 환산했어요. 최근 실적과 꾸준함을 함께 반영합니다.",
    );
  }, []);

  const handleToggleAlert = useCallback(() => {
    if (!stats?.latitude || !stats?.longitude) return;
    const result = toggle({
      id: id!,
      name: stats.name,
      rank: stats.nation_rank,
      latitude: stats.latitude,
      longitude: stats.longitude,
    });
    if (result === null) {
      Alert.alert("선택 제한", `무료 회원은 최대 ${GEOFENCE_FREE_TIER_MAX}개 판매점까지 등록할 수 있어요.`);
    }
  }, [toggle, id, stats]);

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
          <View style={styles.actionButtons}>
            <Pressable
              hitSlop={8}
              onPress={() => toggleFavorite({ id: id!, name: stats.name, address: stats.address }, userId)}
            >
              <Text style={styles.favoriteIcon}>{isFavorite ? "⭐" : "☆"}</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={handleToggleAlert}>
              <Text style={styles.alertIcon}>{isSelected ? "🔔" : "🔕"}</Text>
            </Pressable>
          </View>
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

        {/* 편의시설 */}
        <View style={styles.headerAmenitiesSection}>
          <Text style={styles.headerSectionLabel}>편의시설</Text>
          {displayHasParking || displayHasRestroom || displayHasAtm || displayAmenities.length > 0 ? (
            <Text style={styles.amenitiesEmojiRow}>
              {displayHasParking && "🅿️ "}
              {displayHasRestroom && "🚻 "}
              {displayHasAtm && "💳 "}
              {displayAmenities.map((amenity: string) => `${amenity} `).join("")}
            </Text>
          ) : (
            <Text style={styles.amenitiesEmojiRow}>정보없음</Text>
          )}
        </View>

        {/* 영업시간 */}
        {(ownerBusinessHoursText || (stats as any).business_hours) && (
          <View style={styles.headerBusinessHoursSection}>
            <Text style={styles.headerSectionLabel}>🕐 영업시간</Text>
            <Text style={styles.headerBusinessHoursText}>
              {ownerBusinessHoursText || summarizeBusinessHours((stats as any).business_hours as Record<string, string>)}
            </Text>
          </View>
        )}

        {/* 사장님 한마디 */}
        <View style={styles.headerOwnerMessageSection}>
          <Text style={styles.headerSectionLabel}>사장님 한마디</Text>
          <Text style={styles.headerOwnerMessageText}>
            {ownerMessage ? `💬 ${ownerMessage}` : "사장님 한마디: 아직없음"}
          </Text>
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

      {/* 주변 시설 찾기 카드 */}
      {stats.latitude != null && stats.longitude != null && (
        <View style={styles.nearbySearchCard}>
          <Text style={styles.nearbySearchCardTitle}>주변시설</Text>
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
                <Text style={styles.nearbySearchButtonIcon}>{item.icon}</Text>
                <Text style={styles.nearbySearchButtonText}>{item.keyword}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* 소유권 이전 대기 배너 */}
      <OwnershipTransferBanner storeId={id!} />

      {/* 사장님 인증/관리 CTA */}
      <Pressable
        style={styles.ownerCtaRow}
        onPress={() =>
          isOwner
            ? router.push(`/store-owner/manage?storeId=${id}`)
            : router.push(`/store-owner/signup?storeId=${id}`)
        }
      >
        <Text style={styles.ownerCtaText}>
          {isOwner ? "🔧 매장 정보 수정하기" : "🏪 이 매장 사장님이신가요?"}
        </Text>
      </Pressable>

      {/* 점수 및 순위 */}
      <View style={styles.scoreSection}>
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
      </View>

      {/* 당첨 통계 */}
      <View style={[styles.section, styles.statsSection]}>
        <Text style={styles.sectionTitle}>당첨 통계</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>1등 배출</Text>
              <Text style={styles.statText}><Text style={styles.statCount}>{stats.first_prize_count}</Text><Text style={styles.statUnit}>회</Text></Text>
            </View>
          </View>
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>2등 배출</Text>
              <Text style={styles.statText}><Text style={styles.statCount}>{stats.second_prize_count}</Text><Text style={styles.statUnit}>회</Text></Text>
            </View>
          </View>
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>1년 내 1등</Text>
              <Text style={styles.statText}><Text style={styles.statCount}>{stats.first_prize_1yr}</Text><Text style={styles.statUnit}>회</Text></Text>
            </View>
          </View>
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>5년 내 1등</Text>
              <Text style={styles.statText}><Text style={styles.statCount}>{stats.first_prize_5yr}</Text><Text style={styles.statUnit}>회</Text></Text>
            </View>
          </View>
        </View>
        <Text style={styles.statsFootnote}>
          * 1년/5년 당첨 통계는 최신 당첨 데이터 업데이트가 반영된 결과입니다.
        </Text>
      </View>

      {/* 최근 당첨 이력 */}
      <View style={styles.section}>
        <Pressable style={styles.sectionHeaderRow} onPress={() => setWinningsExpanded(!winningsExpanded)}>
          <Text style={styles.sectionTitle}>최근 당첨 이력</Text>
          <Text style={styles.sectionToggle}>{winningsExpanded ? "▲" : "▼"}</Text>
        </Pressable>
        {winningsExpanded && (
          <>
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
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  headerAmenitiesSection: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  headerBusinessHoursSection: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center" },
  headerOwnerMessageSection: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  headerSectionLabel: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, flexShrink: 0 },
  headerBusinessHoursText: { fontSize: 12, color: colors.textPrimary, flex: 1 },
  headerOwnerMessageText: { fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  headerInfoEmpty: { fontSize: 13, color: colors.textMuted },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  actionButtons: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  favoriteIcon: { fontSize: 22, color: colors.gold },
  alertIcon: { fontSize: 22 },
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
  scoreSection: { gap: spacing.sm },
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
  rankGrid: { flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  rankCell: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    ...cardShadow,
  },
  rankLabel: { fontSize: 11, color: colors.textMuted },
  rankValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: numericFont.bold,
  },
  section: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...cardShadow,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionToggle: { fontSize: 12, color: colors.textMuted },
  statsSection: { paddingVertical: spacing.lg },
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
  },
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statText: { fontSize: 13, color: colors.textPrimary, lineHeight: 22 },
  statLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", lineHeight: 22, flex: 1 },
  statCount: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
    fontFamily: numericFont.bold,
    lineHeight: 22,
  },
  statUnit: { fontSize: 12, color: colors.textMuted, lineHeight: 22 },
  statsFootnote: { fontSize: 11, color: colors.textMuted, lineHeight: 16, marginTop: spacing.sm },
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
  ratingSection: { gap: spacing.sm },
  ratingCard: {
    backgroundColor: colors.goldLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  ratingValue: { fontSize: 20, fontWeight: "800", color: colors.gold, fontFamily: numericFont.bold },
  ratingCount: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  latestReview: { fontSize: 12, color: colors.textSecondary, fontStyle: "italic", lineHeight: 18 },

  // 편의시설
  amenitiesSection: { gap: spacing.md },
  amenitiesHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amenitiesEditLink: { fontSize: 13, fontWeight: "600", color: colors.primary },
  amenitiesEmojiRow: { fontSize: 16, color: colors.textPrimary, letterSpacing: 2 },
  amenitiesEmptyText: { fontSize: 13, color: colors.textMuted },
  nearbySearchCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    ...cardShadow,
  },
  nearbySearchCardTitle: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  nearbySearchRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  nearbySearchButton: {
    flex: 1,
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: "center",
    gap: 2,
  },
  nearbySearchButtonIcon: { fontSize: 18 },
  nearbySearchButtonText: { fontSize: 10, color: colors.primaryDark, fontWeight: "600" },

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

  // 사장님 인증/관리 CTA
  ownerCtaRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ownerCtaText: { fontSize: 13, fontWeight: "600", color: colors.primary, textAlign: "center" },
});
