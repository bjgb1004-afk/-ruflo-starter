import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
    },
    trigger: null, // 즉시 발송
  });
}
