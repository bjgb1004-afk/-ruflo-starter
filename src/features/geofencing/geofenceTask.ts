import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendStoreArrivalNotification } from "./notifications";

export const GEOFENCE_TASK_NAME = "LOTTO_STORE_GEOFENCE_TASK";
export const GEOFENCE_STORE_MAP_KEY = "geofence_store_map";
export const GEOFENCE_DEBUG_LOG_KEY = "geofence_debug_log";

export type GeofenceStoreInfo = { name: string; rank: number | null };

// 마지막 알림 시각을 기록해 같은 매장 반경 안에서 재진입/재알림 스팸을 막는다.
// 메모리(Map)에만 두면 안드로이드가 백그라운드 태스크를 위해 JS 컨텍스트를 새로 띄울 때마다
// (앱 강제종료 후 재개 등 아주 흔한 상황) 기록이 사라져서, 같은 프로세스 생애주기 안에서만
// 쿨다운이 지켜지고 재시작을 넘나드는 재진입엔 매번 다시 알림이 갔다 - AsyncStorage에 저장해
// 프로세스가 새로 떠도 이어지게 한다.
const RENOTIFY_COOLDOWN_MS = 60 * 60 * 1000; // 1시간
const LAST_NOTIFIED_KEY = "geofence_last_notified_at";

async function getLastNotifiedAt(storeId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_NOTIFIED_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    return map[storeId] ?? null;
  } catch {
    return null;
  }
}

async function setLastNotifiedAt(storeId: string, at: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LAST_NOTIFIED_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[storeId] = at;
    await AsyncStorage.setItem(LAST_NOTIFIED_KEY, JSON.stringify(map));
  } catch {
    // 저장 실패해도 알림 자체는 이미 보냈으니 무시 - 최악의 경우 쿨다운만 못 지킴
  }
}

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
  const last = await getLastNotifiedAt(region.identifier);
  if (last && now - last < RENOTIFY_COOLDOWN_MS) return;

  const raw = await AsyncStorage.getItem(GEOFENCE_STORE_MAP_KEY);
  const storeMap: Record<string, GeofenceStoreInfo> = raw ? JSON.parse(raw) : {};
  const info = storeMap[region.identifier];

  if (!info) return;

  await setLastNotifiedAt(region.identifier, now);
  await sendStoreArrivalNotification(info.name, info.rank);
});
