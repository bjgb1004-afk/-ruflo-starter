import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// 로또 6/45는 1회차(2002-12-07 20:45 KST)부터 매주 토요일 같은 시각에 추첨한다.
// 회차 번호만으로 추첨 일시를 역산할 수 있어, 아직 draw_history에 없는(미래) 회차라도
// API 호출 없이 정확한 알림 시각을 계산할 수 있다.
const FIRST_DRAW_MS = Date.parse("2002-12-07T20:45:00+09:00");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function estimateDrawDateTime(drawNo: number): Date {
  return new Date(FIRST_DRAW_MS + (drawNo - 1) * WEEK_MS);
}

const REMINDER_CHANNEL_ID = "draw-reminder";

async function ensureReminderChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: "추첨일 알림",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

// 보관함에 저장한 회차의 추첨 시각에 맞춰 로컬 알림을 예약한다. 이미 지난 회차(과거 회차를
// 나중에 스캔한 경우)는 예약할 필요가 없어 조용히 넘어간다.
export async function scheduleDrawReminder(drawNo: number): Promise<void> {
  const drawAt = estimateDrawDateTime(drawNo);
  if (drawAt.getTime() <= Date.now()) return;

  await ensureReminderChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🎟️ 오늘은 로또 추첨일이에요!",
      body: `${drawNo}회 추첨 결과가 곧 나와요. 내 복권 보관함에서 당첨을 확인해보세요.`,
      sound: true,
      ...(Platform.OS === "android" ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: drawAt },
  });
}
