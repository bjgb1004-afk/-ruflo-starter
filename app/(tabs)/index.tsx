import { StyleSheet, View, ActivityIndicator, Text, TextInput, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useNearbyStores } from "@/features/map/hooks/useNearbyStores";
import { StoreMapView } from "@/features/map/components/StoreMapView";
import { TopStoresCarousel } from "@/features/map/components/TopStoresCarousel";
import { searchStores, type StoreSearchResult } from "@/features/stores/api/storesApi";
import { NewWinnerBanner } from "@/features/draws/components/NewWinnerBanner";
import { NoticeCard } from "@/features/notices/components/NoticeCard";
import { getLatestFirstPrizeWinners } from "@/features/draws/api/drawHistoryApi";
import { useFavorites } from "@/features/favorites/useFavorites";
import { DEFAULT_SEARCH_RADIUS_M } from "@/constants/config";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";

type SortMode = "recommend" | "distance";

const SearchResultRow = ({ item, onPress }: { item: StoreSearchResult; onPress: (id: string) => void }) => (
  <Pressable style={styles.resultRow} onPress={() => onPress(item.id)}>
    <Text style={styles.resultName}>{item.name}</Text>
    <Text style={styles.resultAddress}>{item.address}</Text>
  </Pressable>
);

export default function MapScreen() {
  const router = useRouter();
  const { location, error: locationError } = useCurrentLocation();

  // 지도를 다른 지역으로 옮기면 그 지역 기준으로 다시 조회하도록, GPS 위치와는 별도로
  // "조회 기준 좌표"를 둔다. 최초 진입 시엔 GPS 위치로 채워지고, 이후 지도 이동이 우선한다.
  const [queryCenter, setQueryCenter] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  useEffect(() => {
    if (location && !queryCenter) {
      setQueryCenter({ latitude: location.coords.latitude, longitude: location.coords.longitude });
    }
  }, [location, queryCenter]);

  // 핀치 줌이나 마커 탭 후 카메라가 미세하게 움직이는 것까지 매번 재조회하면, 마커 전체가
  // 다시 그려지면서 방금 연 말풍선이 닫히고 "화면이 리셋"되는 것처럼 보인다.
  // 실제로 의미 있게(대략 검색 반경의 1/4 이상) 이동했을 때만 다시 불러온다.
  // Android에서 onRegionChangeComplete가 관성 스크롤 중 연속으로 여러 번 호출될 수 있어,
  // 400ms debounce로 마지막 호출만 반영하고(빈 화면/반복 새로고침 방지) unmount 시 타이머를 정리한다.
  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    };
  }, []);

  const handleRegionChangeComplete = useCallback(
    (region: { latitude: number; longitude: number }) => {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
      regionDebounceRef.current = setTimeout(() => {
        setQueryCenter((prev) => {
          if (!prev) return { latitude: region.latitude, longitude: region.longitude };
          const R = 6371000;
          const dLat = ((region.latitude - prev.latitude) * Math.PI) / 180;
          const dLng = ((region.longitude - prev.longitude) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((prev.latitude * Math.PI) / 180) *
              Math.cos((region.latitude * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          const distanceM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          // 동일 지도 영역에 대한 불필요한 재조회 방지: 의미 있게 이동했을 때만 갱신
          if (distanceM < DEFAULT_SEARCH_RADIUS_M / 4) return prev;
          return { latitude: region.latitude, longitude: region.longitude };
        });
      }, 400);
    },
    [],
  );

  const { data: stores = [], isLoading } = useNearbyStores(
    queryCenter?.latitude,
    queryCenter?.longitude,
    DEFAULT_SEARCH_RADIUS_M,
  );

  const [sortMode, setSortMode] = useState<SortMode>("recommend");
  const [focusCoordinate, setFocusCoordinate] = useState<{
    latitude: number;
    longitude: number;
    delta: number;
  } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: searchResults = [], isFetching: isSearching } = useQuery({
    queryKey: ["stores", "search", debouncedQuery],
    queryFn: () => searchStores(debouncedQuery),
    enabled: debouncedQuery.length > 0,
    staleTime: 60 * 1000,
  });

  const sortedStores = useMemo(() => {
    if (sortMode === "distance") {
      return [...stores].sort((a, b) => a.distance_m - b.distance_m);
    }
    return stores; // nearby_stores RPC가 이미 recommend_score순으로 정렬해서 반환함
  }, [stores, sortMode]);

  // "추천순이 뭘 기준인지 모르겠다"는 피드백에 안내문구 대신 지도 위 배지로 직접 보여준다.
  // stores(원본, recommend_score순)의 상위 3곳을 정렬 모드와 무관하게 항상 표시한다.
  const topRecommendRanks = useMemo(() => {
    const map = new Map<string, 1 | 2 | 3>();
    stores.slice(0, 3).forEach((s, idx) => map.set(s.store_id, (idx + 1) as 1 | 2 | 3));
    return map;
  }, [stores]);

  const favoriteIds = useFavorites((s) => s.stores);
  const favoriteIdSet = useMemo(() => new Set(Object.keys(favoriteIds)), [favoriteIds]);

  const { data: latestWinners } = useQuery({
    queryKey: ["draws", "latest-winners"],
    queryFn: getLatestFirstPrizeWinners,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const newWinnerIdSet = useMemo(
    () => new Set((latestWinners?.stores ?? []).map((w) => w.storeId)),
    [latestWinners],
  );

  // 정렬 버튼은 지도 위 마커 배치 자체를 바꾸지 않아 눌러도 눈에 띄는 변화가 없었다.
  // 눌렀을 때 해당 정렬 기준 1위 매장으로 지도를 이동시켜 버튼이 실제로 작동함을 보여준다.
  // delta(확대 정도)를 모드별로 다르게 둬서, 두 버튼의 1위 매장 좌표가 우연히 같더라도
  // 확대 수준이 달라져 "눌렀는데 아무 변화 없음"으로 보이지 않게 한다.
  const handleSortRecommend = useCallback(() => {
    setSortMode("recommend");
    if (stores[0]) {
      setFocusCoordinate({ latitude: stores[0].latitude, longitude: stores[0].longitude, delta: 0.05 });
    }
  }, [stores]);

  const handleSortDistance = useCallback(() => {
    setSortMode("distance");
    const nearest = [...stores].sort((a, b) => a.distance_m - b.distance_m)[0];
    if (nearest) {
      setFocusCoordinate({ latitude: nearest.latitude, longitude: nearest.longitude, delta: 0.01 });
    }
  }, [stores]);


  const center = useMemo(
    () => ({
      latitude: location?.coords.latitude ?? 0,
      longitude: location?.coords.longitude ?? 0,
    }),
    [location?.coords.latitude, location?.coords.longitude],
  );

  const handlePressStore = useCallback(
    (storeId: string) => {
      router.push(`/store/${storeId}`);
    },
    [router],
  );

  const isSearchMode = debouncedQuery.length > 0;

  if (locationError) {
    return (
      <View style={styles.center}>
        <Text>위치 권한이 필요합니다: {locationError}</Text>
      </View>
    );
  }

  if (!location || isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!isSearchMode && (
        <>
          <NoticeCard />
          <NewWinnerBanner />
          {/* 더보기 하위 메뉴에 묻혀 있던 QR 당첨확인을 메인 화면 진입 즉시 보이는 곳으로 이동. */}
          <Pressable style={styles.scanBanner} onPress={() => router.push("/scan")}>
            <Text style={styles.scanBannerEmoji}>🔳</Text>
            <View style={styles.scanBannerTextWrap}>
              <Text style={styles.scanBannerTitle}>QR 당첨 확인</Text>
              <Text style={styles.scanBannerSubtitle}>로또 용지를 스캔해서 바로 확인하세요</Text>
            </View>
            <Text style={styles.scanBannerArrow}>›</Text>
          </Pressable>
        </>
      )}

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="판매점 이름 또는 주소 검색"
          placeholderTextColor="#999"
          value={searchInput}
          onChangeText={setSearchInput}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchInput.length > 0 && (
          <Pressable onPress={() => setSearchInput("")} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>✕</Text>
          </Pressable>
        )}
      </View>

      {!isSearchMode && (
        <View style={styles.sortBar}>
          <Pressable
            style={[styles.sortButton, sortMode === "recommend" && styles.sortButtonActive]}
            onPress={handleSortRecommend}
          >
            <Text style={[styles.sortButtonText, sortMode === "recommend" && styles.sortButtonTextActive]}>
              추천순
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortButton, sortMode === "distance" && styles.sortButtonActive]}
            onPress={handleSortDistance}
          >
            <Text style={[styles.sortButtonText, sortMode === "distance" && styles.sortButtonTextActive]}>
              거리순
            </Text>
          </Pressable>
        </View>
      )}

      {isSearchMode ? (
        isSearching ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : searchResults.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <SearchResultRow item={item} onPress={handlePressStore} />}
          />
        )
      ) : (
        <View style={styles.mapWrap}>
          <StoreMapView
            center={center}
            stores={sortedStores}
            onPressStore={handlePressStore}
            onRegionChangeComplete={handleRegionChangeComplete}
            focusCoordinate={focusCoordinate}
            topRecommendRanks={topRecommendRanks}
            favoriteIds={favoriteIdSet}
            newWinnerIds={newWinnerIdSet}
          />
          <TopStoresCarousel stores={stores} onPressStore={handlePressStore} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapWrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  scanBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    ...cardShadow,
  },
  scanBannerEmoji: { fontSize: 24 },
  scanBannerTextWrap: { flex: 1 },
  scanBannerTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
  scanBannerSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 1 },
  scanBannerArrow: { fontSize: 20, color: "#fff", fontWeight: "700" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    ...cardShadow,
  },
  searchInput: { flex: 1, paddingVertical: spacing.sm + 2, fontSize: 15, color: colors.textPrimary },
  clearButton: { padding: spacing.xs + 2 },
  clearButtonText: { color: colors.textMuted, fontSize: 14 },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sortButton: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sortButtonText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  sortButtonTextActive: { color: "#fff" },
  resultRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  resultName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  resultAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
