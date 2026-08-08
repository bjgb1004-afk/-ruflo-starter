import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Callout, Marker, type Region } from "react-native-maps";
import ClusteredMapView from "react-native-map-clustering";
import * as Location from "expo-location";
import { reportError } from "@/lib/errorLog";
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
      // react-native-maps의 잘 알려진 함정: tracksViewChanges=false인 커스텀 View 마커는
      // 레이아웃이 끝나기 전에 스냅샷이 찍히면 그대로 "빈 마커"로 굳어버릴 수 있다.
      // cluster={false}로 클러스터링에서 제외해도 배지가 안 보인다는 재현 보고를 받고 나서
      // 이 케이스일 가능성이 높다고 판단 - 순위 배지는 화면에 최대 3개뿐이라 계속 다시
      // 그려도(true) 성능 부담이 없어, 이 배지에 한해서만 예외적으로 켜둔다.
      tracksViewChanges={badge.type === "rank"}
      // react-native-map-clustering은 기본적으로 모든 Marker를 클러스터링 대상으로 삼아,
      // 주변에 매장이 몰려있으면 1/2/3등 배지 마커까지 숫자 뭉치(cluster) 안에 흡수되어
      // 화면에서 사라져버린다("코드는 있는데 지도엔 안 보임"의 원인). 순위 배지는 사용자가
      // 반드시 눈으로 확인해야 하는 정보라 클러스터링 대상에서 제외한다.
      // cluster는 react-native-map-clustering이 런타임에 props에서 직접 읽는 확장 prop이라
      // react-native-maps의 MapMarkerProps 타입 선언에는 없다 - as any로 우회한다.
      {...({ cluster: badge.type !== "rank" } as any)}
    >
      {pin}
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
// Android는 Google Maps, iOS는 Apple Maps(react-native-maps 기본값). 지도 공급자를
// 교체할 경우 이 컴포넌트만 대체하면 되도록 화면 코드와 분리했다.
// 판매점이 밀집된 지역에서 마커가 겹쳐 렌더링 비용이 커지는 것을 막기 위해 클러스터링 적용.
export const StoreMapView = memo(function StoreMapView({
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

  // 현재 위치 버튼 토글: 1회 탭 시 현재 위치로 이동 + 추적 모드 ON(이후 위치가 바뀔 때마다
  // 지도가 계속 따라감), 다시 탭하면 추적 모드 OFF(구독 해제, 지도는 사용자가 둔 자리에 그대로 유지).
  const [isTracking, setIsTracking] = useState(false);
  const watchSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  // handleToggleTracking의 await 구간(권한요청/현재위치/구독시작) 도중 화면이 unmount되면,
  // unmount 시점엔 아직 구독 객체가 없어 cleanup이 정리하지 못하고, await가 끝난 뒤에야
  // watchSubscriptionRef에 할당되어 영원히 해제되지 않는 누수가 생긴다. 각 await 이후
  // 이 플래그를 확인해 unmount 후에는 구독을 만들자마자 바로 해제한다.
  const isMountedRef = useRef(true);

  const stopTracking = useCallback(() => {
    watchSubscriptionRef.current?.remove();
    watchSubscriptionRef.current = null;
    setIsTracking(false);
  }, []);

  const handleToggleTracking = useCallback(async () => {
    if (isTracking) {
      stopTracking();
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!isMountedRef.current || status !== "granted") return;

      // 앱 권한은 허용됐어도 기기 상단바에서 위치 서비스(GPS) 자체를 꺼둔 경우
      // getCurrentPositionAsync가 응답 없이 멈추거나 모호한 오류를 던져 "눌렀는데 반응 없음"으로
      // 보인다. 미리 확인해 명확한 안내를 준다.
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!isMountedRef.current) return;
      if (!servicesEnabled) {
        Alert.alert("위치 서비스 꺼짐", "기기의 위치 서비스(GPS)를 켜주세요.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!isMountedRef.current) return;
      mapRef.current?.animateToRegion(
        {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.005,
        },
        500,
      );
      setIsTracking(true);

      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 15 },
        (loc) => {
          mapRef.current?.animateCamera(
            { center: { latitude: loc.coords.latitude, longitude: loc.coords.longitude } },
            { duration: 500 },
          );
        },
      );
      if (!isMountedRef.current) {
        subscription.remove();
        return;
      }
      watchSubscriptionRef.current = subscription;
    } catch (err) {
      reportError(err, "map-location-tracking");
      if (isMountedRef.current) {
        Alert.alert("위치를 가져올 수 없어요", "잠시 후 다시 시도해 주세요.");
        setIsTracking(false);
      }
    }
  }, [isTracking, stopTracking]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      watchSubscriptionRef.current?.remove();
      watchSubscriptionRef.current = null;
    };
  }, []);

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
    <View style={styles.container}>
      <ClusteredMapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        onRegionChangeComplete={onRegionChangeComplete}
        customMapStyle={MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
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
      <Pressable
        style={[styles.locationButton, isTracking && styles.locationButtonActive]}
        onPress={handleToggleTracking}
        hitSlop={8}
      >
        <Text style={styles.locationButtonIcon}>{isTracking ? "🎯" : "📍"}</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  locationButton: {
    position: "absolute",
    right: 16,
    bottom: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  locationButtonActive: { backgroundColor: colors.primary },
  locationButtonIcon: { fontSize: 20 },
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
