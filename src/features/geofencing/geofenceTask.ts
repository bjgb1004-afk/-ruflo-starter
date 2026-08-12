import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendStoreArrivalNotification } from "./notifications";

export const GEOFENCE_TASK_NAME = "LOTTO_STORE_GEOFENCE_TASK";
export const GEOFENCE_STORE_MAP_KEY = "geofence_store_map";
export const GEOFENCE_DEBUG_LOG_KEY = "geofence_debug_log";

export type GeofenceStoreInfo = { name: string; rank: number | null };

// 마지막 알림 시각을 기록해 같은 매장 반경 안에서 재진입/재알림 스팸을 막는다.
const RENOTIFY_COOLDOWN_MS = 60 * 60 * 1000; // 1시간
const lastNotifiedAt = new Map<string, number>();

// 실기기에서 알림이 안 뜬다는 신고가 있어, OS가 태스크 자체를 호출했는지부터 확인하기 위한
// 진단용 로그. 알림 없이 조용히 AsyncStorage에만 남기므로 사용자 경험에 영향 없다.
async function logDebugEvent(message: string) {
  try {
    await AsyncStorage.setItem(
      GEOFENCE_DEBUG_LOG_KEY,
      JSON.stringify({ message, at: new Date().toISOString() }),
    );
  } catch {
    // 로그 실패는 무시 - 진단용이라 기능에 영향 주면 안 됨
  }
}

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("[geofence] task error:", error.message);
    await logDebugEvent(`task error: ${error.message}`);
    return;
  }

  const { eventType, region } = (data ?? {}) as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };

  await logDebugEvent(`task invoked: eventType=${eventType} identifier=${region?.identifier ?? "none"}`);

  if (eventType !== Location.GeofencingEventType.Enter || !region.identifier) return;

  const now = Date.now();
  const last = lastNotifiedAt.get(region.identifier);
  if (last && now - last < RENOTIFY_COOLDOWN_MS) return;

  const raw = await AsyncStorage.getItem(GEOFENCE_STORE_MAP_KEY);
  const storeMap: Record<string, GeofenceStoreInfo> = raw ? JSON.parse(raw) : {};
  const info = storeMap[region.identifier];

  if (!info) return;

  lastNotifiedAt.set(region.identifier, now);
  await sendStoreArrivalNotification(info.name, info.rank);
});
