import { StyleSheet, View, ActivityIndicator, Text } from "react-native";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useNearbyStores } from "@/features/map/hooks/useNearbyStores";
import { NaverMapView } from "@/features/map/components/NaverMapView";
import { DEFAULT_SEARCH_RADIUS_M } from "@/constants/config";

export default function MapScreen() {
  const { location, error: locationError } = useCurrentLocation();
  const { data: stores = [], isLoading } = useNearbyStores(
    location?.coords.latitude,
    location?.coords.longitude,
    DEFAULT_SEARCH_RADIUS_M,
  );

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
      <NaverMapView
        center={{
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }}
        stores={stores}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
