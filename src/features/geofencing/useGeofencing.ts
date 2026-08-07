import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { reportError } from "@/lib/errorLog";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureGeofenceNotificationChannel, requestNotificationPermission } from "./notifications";
import { GEOFENCE_STORE_MAP_KEY, GEOFENCE_TASK_NAME, type GeofenceStoreInfo } from "./geofenceTask";
import { GEOFENCE_RADIUS_M } from "@/constants/config";
import { useSelectedStores, type SelectedStore } from "./useSelectedStores";

const ENABLED_STORAGE_KEY = "geofence_enabled";

export type GeofencingStatus = "idle" | "loading" | "enabled" | "error";

function buildRegions(stores: SelectedStore[]): Location.LocationRegion[] {
  return stores.map((store) => ({
    identifier: store.id,
    latitude: store.latitude,
    longitude: store.longitude,
    radius: GEOFENCE_RADIUS_M,
    notifyOnEnter: true,
    notifyOnExit: false,
  }));
}

async function persistStoreMap(stores: SelectedStore[]) {
  const storeMap: Record<string, GeofenceStoreInfo> = {};
  for (const store of stores) {
    storeMap[store.id] = { name: store.name, rank: store.rank };
  }
  await AsyncStorage.setItem(GEOFENCE_STORE_MAP_KEY, JSON.stringify(storeMap));
}

export function useGeofencing() {
  const selectedStores = useSelectedStores((s) => s.stores);
  const [status, setStatus] = useState<GeofencingStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [wasEnabled, isRunning] = await Promise.all([
        AsyncStorage.getItem(ENABLED_STORAGE_KEY),
        Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME),
      ]);
      if (wasEnabled === "true" && isRunning) setStatus("enabled");
    })();
  }, []);

  const disable = useCallback(async () => {
    const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (isRunning) await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    await AsyncStorage.setItem(ENABLED_STORAGE_KEY, "false");
    setStatus("idle");
  }, []);

  const enable = useCallback(async () => {
    const stores = Object.values(selectedStores);
    if (stores.length === 0) {
      setStatus("error");
      setErrorMessage("알림 받을 판매점을 먼저 선택해주세요.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    try {
      await ensureGeofenceNotificationChannel();
      const notifGranted = await requestNotificationPermission();
      if (!notifGranted) {
        setStatus("error");
        setErrorMessage("알림 권한이 필요합니다.");
        return;
      }

      const fgPermission = await Location.requestForegroundPermissionsAsync();
      if (fgPermission.status !== "granted") {
        setStatus("error");
        setErrorMessage("위치 권한이 필요합니다.");
        return;
      }

      const bgPermission = await Location.requestBackgroundPermissionsAsync();
      if (bgPermission.status !== "granted") {
        setStatus("error");
        setErrorMessage("백그라운드 위치 권한이 필요합니다 (설정에서 '항상 허용' 선택).");
        return;
      }

      // 권한은 모두 허용됐어도 기기 상단바에서 위치 서비스(GPS) 자체가 꺼져 있으면
      // 지오펜스가 등록되어도 실제로는 절대 발동하지 않는다 - 조용히 실패하지 않도록 미리 확인한다.
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setStatus("error");
        setErrorMessage("기기의 위치 서비스(GPS)를 켜주세요.");
        return;
      }

      await persistStoreMap(stores);
      await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, buildRegions(stores));
      await AsyncStorage.setItem(ENABLED_STORAGE_KEY, "true");
      setStatus("enabled");
    } catch (err) {
      reportError(err, "geofencing");
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, [selectedStores]);

  // 알림이 켜진 상태에서 선택 목록이 바뀌면 지오펜스를 재등록해 동기화한다.
  useEffect(() => {
    if (status !== "enabled") return;

    const stores = Object.values(selectedStores);
    if (stores.length === 0) {
      disable();
      return;
    }

    (async () => {
      await persistStoreMap(stores);
      await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, buildRegions(stores));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStores]);

  return {
    status,
    errorMessage,
    selectedCount: Object.keys(selectedStores).length,
    enable,
    disable,
  };
}
