import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { AppState } from "react-native";
import { reportError } from "@/lib/errorLog";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureGeofenceNotificationChannel, requestNotificationPermission } from "./notifications";
import { GEOFENCE_STORE_MAP_KEY, GEOFENCE_TASK_NAME, type GeofenceStoreInfo } from "./geofenceTask";
import { GEOFENCE_RADIUS_M } from "@/constants/config";
import { useSelectedStores, type SelectedStore } from "./useSelectedStores";

export const GEOFENCE_ENABLED_STORAGE_KEY = "geofence_enabled";

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

// 로그아웃 시 다음에 로그인하는(같은 기기의 다른) 사용자에게 이 계정의 명당알림 선택이
// 새어나가지 않도록 훅 바깥(useAuth.signOut)에서도 호출 가능한 순수 함수로 둔다.
export async function stopGeofencingCompletely(): Promise<void> {
  const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
  if (isRunning) await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  await AsyncStorage.multiRemove([GEOFENCE_ENABLED_STORAGE_KEY, GEOFENCE_STORE_MAP_KEY]);
}

export function useGeofencing() {
  const selectedStores = useSelectedStores((s) => s.stores);
  const [status, setStatus] = useState<GeofencingStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [wasEnabled, isRunning] = await Promise.all([
        AsyncStorage.getItem(GEOFENCE_ENABLED_STORAGE_KEY),
        Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME),
      ]);
      if (wasEnabled === "true" && isRunning) setStatus("enabled");
    })();
  }, []);

  const disable = useCallback(async () => {
    const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (isRunning) await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    await AsyncStorage.setItem(GEOFENCE_ENABLED_STORAGE_KEY, "false");
    setStatus("idle");
  }, []);

  // "enabled" 표시는 처음 켤 때 권한이 있었다는 것만 의미하고, 그 이후 설정 앱에서 권한을
  // 껐거나 OS가 오래 안 쓴 백그라운드 위치 권한을 자동 회수해도 이 화면은 갱신되지 않아
  // 계속 "알림 켜짐"으로 보였다 - 실제로는 조용히 죽어있는데도. 앱이 다시 포그라운드로
  // 올 때마다 실제 권한 상태를 재확인해, 꺼져있으면 명확히 알려준다.
  useEffect(() => {
    if (status !== "enabled") return;

    const revalidate = async () => {
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
      if (fgStatus !== "granted" || bgStatus !== "granted") {
        await disable();
        setStatus("error");
        setErrorMessage("위치 권한이 꺼져 있어 명당알림이 중지됐습니다. 다시 켜려면 권한을 허용해주세요.");
      }
    };

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") revalidate();
    });
    return () => subscription.remove();
  }, [status, disable]);

  const enable = useCallback(async () => {
    const stores = Object.values(selectedStores);
    if (stores.length === 0) {
      setStatus("error");
      setErrorMessage("알림 받을 판매점을 먼저 선택해주세요.");
      return;
    }

    // Expo Go는 SDK 53부터 백그라운드 위치 기반 지오펜싱을 지원하지 않는다(권한 요청과
    // startGeofencingAsync 호출 자체는 에러 없이 성공한 것처럼 보이지만, 실제로는 백그라운드
    // 진입 이벤트가 절대 발동하지 않는다) - 결제/한도가 걸린 기능인데 "켜짐"으로 표시되고
    // 조용히 작동하지 않는 게 가장 나쁜 실패 모드라, 시작 전에 명확히 안내한다.
    if (Constants.appOwnership === "expo") {
      setStatus("error");
      setErrorMessage("Expo Go에서는 명당알림이 지원되지 않습니다. 정식 설치된 앱에서 사용해주세요.");
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
      await AsyncStorage.setItem(GEOFENCE_ENABLED_STORAGE_KEY, "true");
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
