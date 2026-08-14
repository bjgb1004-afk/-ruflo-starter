import { FlatList, StyleSheet, Text, View, Pressable, ActivityIndicator, Alert } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { supabase } from "@/lib/supabase";
import type { StoreRankingStats } from "@/types/database.types";
import { useSelectedStores } from "@/features/geofencing/useSelectedStores";
import { Dropdown } from "@/components/Dropdown";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";
import { GEOFENCE_FREE_TIER_MAX } from "@/constants/config";

type RankingType = "nation" | "province";
type RankingStoreWithLocation = StoreRankingStats & { latitude: number; longitude: number };
const ITEMS_PER_PAGE = 50;

const SIDO_LIST = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시",
  "대전광역시", "울산광역시", "세종특별자치시", "경기도", "강원특별자치도",
  "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

const identityKey = (s: string) => s;

const RankingRow = memo(function RankingRow({
  item,
  rank,
}: {
  item: RankingStoreWithLocation;
  rank: number | null;
}) {
  const isSelected = useSelectedStores((s) => !!s.stores[item.id]);
  const toggle = useSelectedStores((s) => s.toggle);

  const handleToggleAlert = useCallback(() => {
    const result = toggle({
      id: item.id,
      name: item.name,
      rank: item.nation_rank,
      latitude: item.latitude,
      longitude: item.longitude,
    });
    if (result === null) {
      Alert.alert("선택 제한", `무료 회원은 최대 ${GEOFENCE_FREE_TIER_MAX}개 판매점까지 등록할 수 있어요.`);
    }
  }, [toggle, item]);

  const rankBadgeStyle =
    rank === 1
      ? styles.rankBadgeGold
      : rank === 2
        ? styles.rankBadgeSilver
        : rank === 3
          ? styles.rankBadgeBronze
          : styles.rankBadgeDefault;

  const isTop3 = rank === 1 || rank === 2 || rank === 3;

  return (
    <Link href={`/store/${item.id}`} asChild>
      <Pressable style={styles.row}>
        <View style={[styles.rankBadge, rankBadgeStyle, isTop3 && styles.rankBadgeTop3]}>
          <Text style={[styles.rank, isTop3 && styles.rankTop3Text]}>{rank ?? "-"}</Text>
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{item.name}</Text>
            {!isTop3 && item.nation_rank != null && item.nation_rank <= 100 && (
              <Text style={styles.top100Badge}>🏆 TOP100</Text>
            )}
          </View>
          <Text style={styles.address} numberOfLines={1}>
            {item.address}
          </Text>
          <Text style={styles.meta}>
            1등 {item.first_prize_count}회
            {item.second_prize_count > 0 ? ` · 2등 ${item.second_prize_count}회` : ""} · 점수{" "}
            {Math.round(item.store_score)}
          </Text>
        </View>
        <Pressable onPress={handleToggleAlert} hitSlop={10} style={styles.bellButton}>
          <Text style={styles.bellIcon}>{isSelected ? "🔔" : "🔕"}</Text>
        </Pressable>
      </Pressable>
    </Link>
  );
});

export default function RankingScreen() {
  const [rankingType, setRankingType] = useState<RankingType>("nation");
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const selectedCount = useSelectedStores((s) => Object.keys(s.stores).length);

  // 지역 통계 탭에서 특정 시/도 막대를 눌러 넘어온 경우, 그 시/도의 시도별 랭킹으로 바로 진입
  const { sido: sidoParam } = useLocalSearchParams<{ sido?: string }>();
  useEffect(() => {
    if (sidoParam) {
      setRankingType("province");
      setSelectedProvince(sidoParam);
      setSelectedCity(null);
      setPage(0);
    }
    // sidoParam이 바뀔 때만 반응 (사용자가 이후 탭을 직접 조작하는 것과 충돌하지 않도록)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidoParam]);

  // 시도별 탭은 시도 선택 전까지 조회하지 않음
  const needsProvince = rankingType === "province";

  // 시/군/구를 선택하면 시/도 전체 상위 100개(province_rank 기준) 안에서 필터링하는 게
  // 아니라, 그 구/군 안에서 다시 city_rank 기준으로 상위 100개를 서버에서 조회한다.
  // (시/도 전체 100등 밖이라도 자기 구/군 안에서는 상위권일 수 있어, 클라이언트 필터링만으론
  // 시/도 전체 순위 밖에 있는 매장이 구/군 랭킹에서 통째로 누락되는 문제가 있었다.)
  const { data: allStores = [], isLoading } = useQuery<RankingStoreWithLocation[]>({
    queryKey: ["stores", "ranking", rankingType, selectedProvince, selectedCity],
    queryFn: async () => {
      let query = supabase
        .from("store_ranking_stats")
        .select("*, stores!inner(latitude, longitude)")
        .limit(100) as any;

      if (rankingType === "nation") {
        query = query.order("nation_rank", { ascending: true, nullsFirst: false });
      } else if (rankingType === "province" && selectedProvince) {
        query = query.eq("sido", selectedProvince);
        if (selectedCity) {
          query = query.eq("sigungu", selectedCity).order("city_rank", { ascending: true, nullsFirst: false });
        } else {
          query = query.order("province_rank", { ascending: true, nullsFirst: false });
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        ...row,
        latitude: row.stores.latitude,
        longitude: row.stores.longitude,
      })) as RankingStoreWithLocation[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !needsProvince || selectedProvince !== null,
  });

  const filteredStores = allStores;

  const stores = useMemo(
    () => filteredStores.slice(0, (page + 1) * ITEMS_PER_PAGE),
    [filteredStores, page],
  );

  // 시군구 드롭다운 목록 - 위 랭킹 조회와 별개로, 시/도 선택 시점에 그 시/도 전체의
  // 구/군 목록을 한 번만 가져온다 (구/군을 고른 뒤에도 목록 자체는 안 바뀌어야 하므로
  // allStores를 재사용하지 않는다).
  const { data: cities = [] } = useQuery<string[]>({
    queryKey: ["stores", "ranking", "cities", selectedProvince],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = (await supabase
        .from("store_ranking_stats")
        .select("sigungu")
        .eq("sido", selectedProvince!)
        .not("sigungu", "is", null)
        .limit(5000)) as any;
      if (error) throw error;
      const names: string[] = (data ?? []).map((r: any) => r.sigungu as string);
      return Array.from(new Set(names)).sort();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: rankingType === "province" && selectedProvince !== null,
  });

  const handleSelectProvince = useCallback((name: string) => {
    setSelectedProvince((prev) => (prev === name ? null : name));
    setSelectedCity(null);
    setPage(0);
  }, []);

  const handleSelectCity = useCallback((name: string) => {
    setSelectedCity((prev) => (prev === name ? null : name));
    setPage(0);
  }, []);

  const renderRankingRow = useCallback(
    ({ item }: { item: RankingStoreWithLocation }) => {
      const rank =
        rankingType === "nation" ? item.nation_rank : selectedCity ? item.city_rank : item.province_rank;
      return <RankingRow item={item} rank={rank} />;
    },
    [rankingType, selectedCity],
  );

  const storeKeyExtractor = useCallback((item: RankingStoreWithLocation) => item.id, []);

  const hasMore = (page + 1) * ITEMS_PER_PAGE < filteredStores.length;

  const handleEndReached = useCallback(() => {
    setPage((p) => ((p + 1) * ITEMS_PER_PAGE < filteredStores.length ? p + 1 : p));
  }, [filteredStores.length]);

  return (
    <View style={styles.container}>
      {selectedCount > 0 && (
        <View style={styles.geofenceHint}>
          <Text style={styles.geofenceHintText}>
            🔔 알림 받을 판매점 {selectedCount}개 선택됨 · 설정 탭에서 알림을 켤 수 있어요
          </Text>
        </View>
      )}

      {/* 탭 선택 */}
      <View style={styles.tabs}>
        <Pressable
          onPress={() => {
            setRankingType("nation");
            setSelectedProvince(null);
            setSelectedCity(null);
            setPage(0);
          }}
          style={[styles.tab, rankingType === "nation" && styles.tabActive]}
        >
          <Text style={[styles.tabText, rankingType === "nation" && styles.tabTextActive]}>
            전국
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setRankingType("province");
            setSelectedCity(null);
            setPage(0);
          }}
          style={[styles.tab, rankingType === "province" && styles.tabActive]}
        >
          <Text style={[styles.tabText, rankingType === "province" && styles.tabTextActive]}>
            시도별
          </Text>
        </Pressable>
      </View>

      {/* 시도별: 시도 선택 - 드롭다운 하나로 17개 시/도를 고른다. 선택하면 그 시/도
          전체 순위가 바로 뜨고, 그 밑에 시/군/구 선택칸이 나타나 더 좁혀볼 수 있다. */}
      {needsProvince && (
        <View style={styles.provinceList}>
          <Dropdown
            placeholder="시/도 선택"
            value={selectedProvince}
            options={SIDO_LIST}
            getKey={identityKey}
            getLabel={identityKey}
            onSelect={handleSelectProvince}
          />
        </View>
      )}

      {/* 시도 선택 후 나타나는 시/군/구 선택 - 고르면 해당 구/군 순위로 좁혀진다 */}
      {rankingType === "province" && selectedProvince && cities.length > 0 && (
        <View style={styles.provinceList}>
          <Dropdown
            placeholder="시/군/구 선택"
            value={selectedCity}
            options={cities}
            getKey={identityKey}
            getLabel={identityKey}
            onSelect={handleSelectCity}
          />
        </View>
      )}

      {needsProvince && !selectedProvince && (
        <View style={styles.center}>
          <Text style={styles.emptyHint}>시/도를 선택해 주세요</Text>
        </View>
      )}

      {/* 랭킹 리스트 */}
      {needsProvince && !selectedProvince ? null : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={stores}
          keyExtractor={storeKeyExtractor}
          renderItem={renderRankingRow}
          removeClippedSubviews
          maxToRenderPerBatch={12}
          windowSize={7}
          initialNumToRender={12}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={hasMore ? <ActivityIndicator style={styles.footerLoader} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyHint: { color: colors.textMuted, fontSize: 14 },
  geofenceHint: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  geofenceHintText: { fontSize: 12, color: colors.textPrimary, fontWeight: "500" },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  provinceList: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, backgroundColor: colors.surface },
  list: { padding: spacing.lg, gap: spacing.sm },
  footerLoader: { paddingVertical: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...cardShadow,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeDefault: { backgroundColor: colors.rankNeutral },
  rankBadgeGold: { backgroundColor: colors.goldBright },
  rankBadgeSilver: { backgroundColor: colors.silver },
  rankBadgeBronze: { backgroundColor: colors.bronze },
  // 1/2/3등은 형태를 통일(사각형)하고 금/은/동 색상으로만 구분한다.
  // 도형이 등수마다 다르면(네모/원/색만 다름) 혼란스럽다는 피드백을 반영.
  rankBadgeTop3: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
  },
  rank: { fontSize: 15, fontWeight: "800", color: "#fff", fontFamily: numericFont.bold },
  rankTop3Text: { fontSize: 17 },
  info: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  name: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  top100Badge: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primaryDark,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  address: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  meta: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontSize: 12,
    fontFamily: numericFont.regular,
  },
  bellButton: { padding: spacing.sm },
  bellIcon: { fontSize: 20 },
});
