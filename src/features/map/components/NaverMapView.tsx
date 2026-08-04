import { StyleSheet } from "react-native";
import { NaverMapView as NMapView, NaverMapMarkerOverlay } from "@react-native-seoul/naver-map";
import type { NearbyStoreRow } from "@/types/database.types";

interface Props {
  center: { latitude: number; longitude: number };
  stores: NearbyStoreRow[];
  onPressStore?: (storeId: string) => void;
}

// 네이버 지도 SDK(@react-native-seoul/naver-map) 래퍼.
// 지도 공급자를 교체할 경우 이 컴포넌트만 대체하면 되도록 화면 코드와 분리했다.
export function NaverMapView({ center, stores, onPressStore }: Props) {
  return (
    <NMapView
      style={styles.map}
      camera={{ latitude: center.latitude, longitude: center.longitude, zoom: 14 }}
    >
      {stores.map((store) => (
        <NaverMapMarkerOverlay
          key={store.store_id}
          latitude={store.latitude}
          longitude={store.longitude}
          caption={{ text: store.name }}
          onTap={() => onPressStore?.(store.store_id)}
        />
      ))}
    </NMapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
