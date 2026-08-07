import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 명당 도착 알림 전용 채널. 다른 기능(공지 등)이 나중에 알림을 추가해도 채널 ID가
// 겹치지 않도록 이 기능 전용 ID를 쓰고, 소리/진동/중요도를 명시적으로 설정한다.
const GEOFENCE_CHANNEL_ID = "geofence-arrival";

export async function ensureGeofenceNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(GEOFENCE_CHANNEL_ID, {
    name: "명당 도착 알림",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    lightColor: "#FFD700",
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;

  const { status: requested } = await Notifications.requestPermissionsAsync();
  return requested === "granted";
}

export async function sendStoreArrivalNotification(storeName: string, rank: number | null) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🍀 명당 판매점 근처예요!",
      body: rank
        ? `${storeName} (전국 ${rank}위)이(가) 근처에 있어요. 방문해보세요!`
        : `${storeName}이(가) 근처에 있어요. 방문해보세요!`,
      sound: true,
      ...(Platform.OS === "android" ? { channelId: GEOFENCE_CHANNEL_ID } : {}),
    },
    trigger: null, // 즉시 발송
  });
}
