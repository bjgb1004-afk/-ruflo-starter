import { StyleSheet, View, ActivityIndicator, Text, TextInput, Pressable, FlatList, Modal, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useNearbyStores } from "@/features/map/hooks/useNearbyStores";
import { StoreMapView } from "@/features/map/components/StoreMapView";
import { TopStoresCarousel } from "@/features/map/components/TopStoresCarousel";
import { searchStores, type StoreSearchResult } from "@/features/stores/api/storesApi";
import { HomeBannerCarousel } from "@/features/map/components/HomeBannerCarousel";
import { getLatestFirstPrizeWinners } from "@/features/draws/api/drawHistoryApi";
import { useFavorites } from "@/features/favorites/useFavorites";
import { DEFAULT_SEARCH_RADIUS_M, DEFAULT_MAP_CENTER } from "@/constants/config";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";
import { useResponsive, getResponsiveSpacing, getResponsiveFontSize } from "@/utils/responsive";

type SortMode = "recommend" | "distance";

const SearchResultRow = ({ item, onPress }: { item: StoreSearchResult; onPress: (id: string) => void }) => (
  <Pressable style={styles.resultRow} onPress={() => onPress(item.id)}>
    <Text style={styles.resultName}>{item.name}</Text>
    <Text style={styles.resultAddress}>{item.address}</Text>
  </Pressable>
);

export default function MapScreen() {
  const router = useRouter();
  const { breakpoint } = useResponsive();
  const [showLocationPermissionGuide, setShowLocationPermissionGuide] = useState(false);
  // 예전엔 "AsyncStorage 조회가 끝났는지"(guideCheckDone)를 따로 들고, 그 값으로 스피너를
  // 빠져나갈지 판단했다. 이제는 queryCenter 하나로 판단하므로 필요하지 않다 - 조회가 끝나지
  // 않았으면 queryCenter도 비어 있고, 그 상태의 화면은 어차피 같다.
  const {
    location,
    error: locationError,
    canAskAgain,
    request: requestLocation,
    retry: retryLocation,
  } = useCurrentLocation();

  // 설명을 먼저, 권한은 그다음. 처음 설치한 사람에게는 안내 모달만 띄우고 OS 권한 창은
  // 띄우지 않는다 - 모달의 "위치 허용하기"를 눌렀을 때 비로소 묻는다. 예전엔 화면이 뜨자마자
  // 물어서, 왜 필요한지 모른 채 거부하는 사람이 생겼다(2026-10-31 점검, 삭제율 19%).
  //
  // 이미 안내를 본 사람에게는 모달 없이 바로 묻는다. 설명을 두 번 보여줄 이유가 없고,
  // 재방문자에게 모달이 또 뜨면 그게 더 거슬린다.
  useEffect(() => {
    (async () => {
      const shown = await AsyncStorage.getItem("location-permission-guide-shown");
      if (shown) requestLocation();
      else setShowLocationPermissionGuide(true);
    })();
  }, [requestLocation]);

  // 지도를 다른 지역으로 옮기면 그 지역 기준으로 다시 조회하도록, GPS 위치와는 별도로
  // "조회 기준 좌표"를 둔다. 최초 진입 시엔 GPS 위치로 채워지고, 이후 지도 이동이 우선한다.
  const [queryCenter, setQueryCenter] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  useEffect(() => {
    if (location && !queryCenter) {
      setQueryCenter({ latitude: location.coords.latitude, longitude: location.coords.longitude });
    } else if (locationError && !queryCenter) {
      // 위치 권한을 거부해도 지도가 빈 화면("설정 가세요"만 뜨는 막다른 길)이 되지 않도록
      // 서울시청 기준으로라도 지도와 주변 명당을 보여준다. 거부=앱이 쓸모없다는 인상을
      // 주는 게 설치 직후 이탈(18%)의 유력한 원인이었다.
      setQueryCenter(DEFAULT_MAP_CENTER);
    }
  }, [location, locationError, queryCenter]);

  // 안내 모달을 닫을 때 "봤음"으로 기록한다. 예전엔 띄우는 순간 기록해서, 허용을 누르든
  // 나중을 누르든 구분이 없었다.
  const dismissGuide = useCallback(
    (allow: boolean) => {
      setShowLocationPermissionGuide(false);
      AsyncStorage.setItem("location-permission-guide-shown", "true").catch(() => {});
      if (allow) requestLocation();
      // "나중에"를 누르면 묻지 않는다. 그 경우 location도 locationError도 안 채워지므로,
      // 아래에서 서울시청 기준으로 지도를 띄운다.
      else setQueryCenter((c) => c ?? DEFAULT_MAP_CENTER);
    },
    [requestLocation],
  );

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
      latitude: location?.coords.latitude ?? DEFAULT_MAP_CENTER.latitude,
      longitude: location?.coords.longitude ?? DEFAULT_MAP_CENTER.longitude,
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

  // 안내는 로딩 스피너보다 **먼저** 보여야 한다. 예전엔 맨 아래 return에만 있어서,
  // 위 스피너 분기에서 빠져나가는 동안은 아예 그려지지 않았다. 변수로 빼서 모든 분기가
  // 같이 그린다.
  const permissionGuide = (
    <Modal
      visible={showLocationPermissionGuide}
      transparent
      animationType="fade"
      onRequestClose={() => dismissGuide(false)}
    >
      <View style={styles.modalBackdrop}>
        {/* 바깥을 눌러 닫는 것은 "나중에"와 같다 - 권한 창을 띄우지 않는다. */}
        <Pressable style={styles.modalBackdropTouchable} onPress={() => dismissGuide(false)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>내 주변 판매점을 찾으려면</Text>
          <Text style={styles.modalDescription}>
            위치를 알려주시면 지금 있는 곳 근처의 로또 판매점을 바로 찾아드려요.
          </Text>
          <Text style={styles.modalBullet}>• 내 위치를 지도에 표시</Text>
          <Text style={styles.modalBullet}>• 가까운 명당 판매점 추천</Text>
          <Text style={styles.modalBullet}>• 명당 근처에 가면 알림</Text>
          {/* 거부해도 앱이 쓸모없어지지 않는다는 걸 먼저 밝힌다. 막다른 길처럼 보이면
              허용을 강요받는 느낌이 들고, 그 인상이 설치 직후 이탈로 이어진다. */}
          <Text style={styles.modalDescription}>
            허용하지 않아도 앱은 그대로 쓸 수 있어요. 그때는 서울시청 기준으로 보여드려요.
          </Text>
          <Pressable style={styles.modalButton} onPress={() => dismissGuide(true)}>
            <Text style={styles.modalButtonText}>위치 허용하기</Text>
          </Pressable>
          <Pressable style={styles.modalSecondaryButton} onPress={() => dismissGuide(false)}>
            <Text style={styles.modalSecondaryButtonText}>나중에</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
  // 기다리는 기준을 location이 아니라 queryCenter로 바꿨다. "나중에"를 누르면 location도
  // locationError도 영원히 안 채워져서, location을 기다리면 스피너에 갇힌다. queryCenter는
  // 위치를 받았을 때 / 거부했을 때 / "나중에"를 눌렀을 때 모두 채워지므로 막다른 길이 없다.
  //
  // 스피너 위에 안내를 같이 그린다 - 안내를 읽는 동안 뒤에서 스피너가 도는 건 괜찮지만,
  // 안내가 아예 안 보이면 왜 위치를 묻는지 모른 채 OS 창을 보게 된다(이번 수정의 핵심).
  if (!queryCenter || isLoading) {
    return (
      <>
        {permissionGuide}
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>
            {!queryCenter ? "내 위치를 확인하는 중이에요" : "주변 판매점을 찾는 중이에요"}
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      {permissionGuide}
      <View style={styles.container}>
      {/* 조건을 locationError가 아니라 "내 위치가 없다"로 바꿨다. 안내 모달에서 "나중에"를
          누른 사람은 아예 묻지 않았으므로 오류도 없고, 예전 조건으로는 이 띠가 안 떠서
          위치를 나중에 켤 길이 사라졌다("나중에"가 되돌릴 수 없는 문이 됐다). */}
      {!location && (
        // canAskAgain이면(흔히는 안드로이드 "이번만 허용"이 앱 재시작 때마다 풀린 경우) 설정
        // 화면을 안 거치고 바로 재요청 다이얼로그를 띄운다 - "다시 묻지 않음"으로 완전히
        // 거부된 경우만 설정으로 보낸다.
        <Pressable
          style={styles.locationNotice}
          onPress={canAskAgain ? retryLocation : () => Linking.openSettings()}
        >
          <Text style={styles.locationNoticeText}>
            {canAskAgain
              ? "📍 지금은 서울시청 기준으로 보여드리고 있어요 · 눌러서 위치 권한을 허용하면 내 주변으로 바로 바뀌어요"
              : "📍 지금은 서울시청 기준으로 보여드리고 있어요 · 설정에서 위치 권한을 허용하면 내 주변으로 바로 바뀌어요"}
          </Text>
        </Pressable>
      )}

      {/* 소식 띠(NoticeCard)는 업데이트 소식 팝업으로 옮겼다 - 같은 app_notices를 띠와
          팝업으로 두 번 보여주면 같은 글을 두 군데서 읽게 된다. */}
      {!isSearchMode && <HomeBannerCarousel />}

      <View style={[styles.searchBar, { marginHorizontal: getResponsiveSpacing(spacing.md, breakpoint) }]}>
        <TextInput
          style={[styles.searchInput, { fontSize: getResponsiveFontSize(15, breakpoint) }]}
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
        <View style={[styles.sortBar, { paddingHorizontal: getResponsiveSpacing(spacing.md, breakpoint) }]}>
          <Pressable
            style={[styles.sortButton, sortMode === "recommend" && styles.sortButtonActive, { paddingHorizontal: getResponsiveSpacing(spacing.md + 2, breakpoint) }]}
            onPress={handleSortRecommend}
          >
            <Text style={[styles.sortButtonText, sortMode === "recommend" && styles.sortButtonTextActive, { fontSize: getResponsiveFontSize(13, breakpoint) }]}>
              추천순
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortButton, sortMode === "distance" && styles.sortButtonActive, { paddingHorizontal: getResponsiveSpacing(spacing.md + 2, breakpoint) }]}
            onPress={handleSortDistance}
          >
            <Text style={[styles.sortButtonText, sortMode === "distance" && styles.sortButtonTextActive, { fontSize: getResponsiveFontSize(13, breakpoint) }]}>
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
          <TopStoresCarousel stores={sortedStores} onPressStore={handlePressStore} />
        </View>
      )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapWrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 13 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  locationNotice: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  locationNoticeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalBackdropTouchable: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    width: "80%",
    maxWidth: 320,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#000", textAlign: "center" },
  modalDescription: { fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: "center" },
  modalButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  modalButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  // 목록은 가운데 정렬하지 않는다 - 글머리 기호가 들쭉날쭉해져 읽기 어렵다.
  modalBullet: { fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: "left" },
  // "나중에"는 테두리도 배경도 없다. 허용 버튼과 나란히 두면 둘 중 뭘 눌러야 하는지
  // 고민하게 되는데, 권하는 쪽은 하나다.
  modalSecondaryButton: { paddingVertical: 12, alignItems: "center" },
  modalSecondaryButtonText: { color: colors.textMuted, fontSize: 14 },
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
