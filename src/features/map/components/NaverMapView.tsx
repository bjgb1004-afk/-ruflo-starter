import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import MapView, { Callout, Marker, type Region } from "react-native-maps";
import ClusteredMapView from "react-native-map-clustering";
import type { NearbyStoreRow } from "@/types/database.types";
import { colors, radius } from "@/constants/theme";

// 구글맵 SDK가 기본으로 깔아주는 편의점/식당 등 POI 아이콘을 숨긴다. 이 아이콘들을 누르면
// 우리 앱과 무관하게 구글맵 자체의 "앱으로 열기" 동작이 발생해 "Google 지도가 설치되어
// 있지 않습니다" 같은 안내가 뜨는 원인이 된다 — 우리 판매점 마커만 누르게 하기 위함.
const MAP_STYLE = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

interface Props {
  center: { latitude: number; longitude: number };
  stores: NearbyStoreRow[];
  onPressStore?: (storeId: string) => void;
  onRegionChangeComplete?: (region: Region) => void;
  // 정렬 버튼을 누르면 이 좌표로 지도가 이동한다(매번 새 객체를 넘겨야 같은 좌표를
  // 다시 눌러도 재이동이 트리거된다). delta는 정렬 모드별로 다르게 줘서, 직전 정렬과
  // 목적지 좌표가 우연히 같더라도 확대 정도가 달라져 이동했다는 게 눈에 보이게 한다.
  focusCoordinate?: { latitude: number; longitude: number; delta: number } | null;
  // 추천순 상위 1~3위 매장 id → 순위(1|2|3). "추천순이 뭘 기준으로 하는지 모르겠다"는
  // 피드백에 안내 문구 대신 지도 위에 직접 순위 배지로 보여주는 방식으로 대응한다.
  topRecommendRanks?: Map<string, 1 | 2 | 3>;
  favoriteIds?: Set<string>;
  newWinnerIds?: Set<string>;
}

type MarkerBadge = { type: "rank"; rank: 1 | 2 | 3 } | { type: "new" } | { type: "favorite" } | { type: "default" };

const RANK_BADGE_COLOR: Record<1 | 2 | 3, string> = {
  1: colors.goldBright,
  2: colors.silver,
  3: colors.bronze,
};

// TOP3 배지가 은은하게 커졌다 작아졌다를 반복하며 "여기 주목"을 시각적으로 알린다.
const PulsingBadge = memo(function PulsingBadge({ children }: { children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
});

const StoreMarker = memo(function StoreMarker({
  store,
  onPress,
  badge,
}: {
  store: NearbyStoreRow;
  onPress?: (storeId: string) => void;
  badge: MarkerBadge;
}) {
  // 마커를 누르면 바로 상세페이지로 넘어가면 이름을 확인할 새도 없이 화면이 전환돼버린다.
  // 먼저 이름/주소가 담긴 말풍선을 보여주고, 그 말풍선을 한 번 더 누르면 그때 상세페이지로
  // 이동하도록 한 단계 나눈다. Android에서 기본(title/description) 콜아웃의 onCalloutPress는
  // 마커 탭과 동시에 발생해버리는 알려진 문제가 있어, 직접 그리는 tooltip 콜아웃 + onPress로
  // 대체한다(이 조합이 안정적으로 동작한다).
  const handleCalloutPress = useCallback(() => onPress?.(store.store_id), [onPress, store.store_id]);
  const walkMinutes = Math.round(store.distance_m / 80);
  const pin =
    badge.type === "rank" ? (
      <View style={[styles.pinRank, { backgroundColor: RANK_BADGE_COLOR[badge.rank] }]}>
        <Text style={styles.pinRankText}>{badge.rank}</Text>
      </View>
    ) : badge.type === "new" ? (
      <View style={styles.pinNew}>
        <Text style={styles.pinNewText}>🎉</Text>
      </View>
    ) : badge.type === "favorite" ? (
      <View style={styles.pinFavorite}>
        <Text style={styles.pinFavoriteText}>⭐</Text>
      </View>
    ) : (
      <View style={styles.pinDefault} />
    );

  return (
    <Marker
      coordinate={{ latitude: store.latitude, longitude: store.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      // 애니메이션이 실제로 지도 위에 반영되려면 이 마커만 계속 다시 스냅샷 떠야 한다
      // (기본값 true는 전체 마커에 적용되면 성능 문제가 되므로 TOP3만 켠다).
      tracksViewChanges={badge.type === "rank"}
    >
      {badge.type === "rank" ? <PulsingBadge>{pin}</PulsingBadge> : pin}
      <Callout tooltip onPress={handleCalloutPress}>
        <View style={styles.callout}>
          <Text style={styles.calloutName} numberOfLines={1}>
            {store.name}
          </Text>
          <Text style={styles.calloutAddress} numberOfLines={1}>
            {store.address}
          </Text>
          {walkMinutes <= 5 && <Text style={styles.calloutWalk}>🚶 도보 {Math.max(1, walkMinutes)}분</Text>}
          <Text style={styles.calloutHint}>탭하면 상세정보</Text>
        </View>
      </Callout>
    </Marker>
  );
});

// 지도 컴포넌트 (react-native-maps + react-native-map-clustering 사용)
// 지도 공급자를 교체할 경우 이 컴포넌트만 대체하면 되도록 화면 코드와 분리했다.
// 판매점이 밀집된 지역에서 마커가 겹쳐 렌더링 비용이 커지는 것을 막기 위해 클러스터링 적용.
export const NaverMapView = memo(function NaverMapView({
  center,
  stores,
  onPressStore,
  onRegionChangeComplete,
  focusCoordinate,
  topRecommendRanks,
  favoriteIds,
  newWinnerIds,
}: Props) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!focusCoordinate) return;
    mapRef.current?.animateToRegion(
      {
        latitude: focusCoordinate.latitude,
        longitude: focusCoordinate.longitude,
        latitudeDelta: focusCoordinate.delta,
        longitudeDelta: focusCoordinate.delta * 0.5,
      },
      500,
    );
  }, [focusCoordinate]);

  const initialRegion = useMemo(
    () => ({
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    }),
    // 최초 진입 시 위치만 기준으로 잡고, 이후 위치 변경으로 지도가 재센터링되지 않도록 고정
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <ClusteredMapView
      ref={mapRef}
      style={styles.map}
      initialRegion={initialRegion}
      onRegionChangeComplete={onRegionChangeComplete}
      customMapStyle={MAP_STYLE}
      showsUserLocation
      showsMyLocationButton
      radius={60}
      minPoints={3}
      clusterColor={colors.seal}
      clusterTextColor="#fff"
    >
      {stores.map((store) => {
        const rank = topRecommendRanks?.get(store.store_id);
        const badge: MarkerBadge = rank
          ? { type: "rank", rank }
          : newWinnerIds?.has(store.store_id)
            ? { type: "new" }
            : favoriteIds?.has(store.store_id)
              ? { type: "favorite" }
              : { type: "default" };
        return <StoreMarker key={store.store_id} store={store} onPress={onPressStore} badge={badge} />;
      })}
    </ClusteredMapView>
  );
});

const styles = StyleSheet.create({
  map: { flex: 1 },
  // 순위 1~3위: 랭킹 탭과 같은 언어(금/은/동 사각 배지)로 지도 위에도 표시해서
  // "추천순이 뭘 기준으로 하는지" 설명 문구 없이도 바로 눈에 보이게 한다.
  pinRank: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinRankText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  // "회색/주황 일반 마커": 신규 당첨(주목할 이벤트)은 주황, 그냥 즐겨찾기는 골드 테두리,
  // 아무 특이사항 없는 매장은 아주 옅은 회색 점으로 시각적 위계를 준다.
  pinNew: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  pinNewText: { fontSize: 13 },
  pinFavorite: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.goldBright,
    alignItems: "center",
    justifyContent: "center",
  },
  pinFavoriteText: { fontSize: 13 },
  pinDefault: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.rankNeutral,
    borderWidth: 2,
    borderColor: "#fff",
  },
  callout: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 10,
    minWidth: 160,
    maxWidth: 240,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calloutName: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  calloutAddress: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  calloutWalk: { fontSize: 11, color: colors.orange, marginTop: 4, fontWeight: "600" },
  calloutHint: { fontSize: 11, color: colors.primary, marginTop: 6, fontWeight: "600" },
});
