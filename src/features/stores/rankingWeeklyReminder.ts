import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { nextWeekdayAt } from "@/lib/nextWeekdayAt";
import { useFavorites } from "@/features/favorites/useFavorites";
import { useNotificationSettings } from "@/features/notifications/useNotificationSettings";
import { getStoreRankingStats } from "./api/storesApi";

// 명당 랭킹은 매주 토요일 추첨 직후(20:50~22:30 KST, 실패 시 다음날 새벽 3시 안전망)
// 서버에서 재계산된다(sync-data.yml "명당 랭킹 재계산" 단계). 그 직후인 토요일 밤에
// 알리면 ①드물게 안전망까지 밀렸을 때 아직 안 끝난 걸 "갱신됐다"고 말할 위험이 있고
// ②같은 토요일 밤에 추첨 결과 알림·보관함 당첨 알림까지 겹쳐 알림 피로가 쌓인다
// (drawReminders 8개 동시발송 사고로 세운 교훈). 다음날 일요일 아침으로 띄워 둘 다 피한다.
const NOTIFY_WEEKDAY = 0; // 일요일
const NOTIFY_HOUR = 10;

const REMINDER_ID = "ranking-weekly";
const CHANNEL_ID = "ranking-weekly";

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "명당 랭킹 알림",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: "default",
  });
}

/**
 * 즐겨찾기한 매장 중 전국 순위가 있는 곳을 골라 다음 일요일 알림을 지금 순위로 다시
 * 예약한다. 앱 시작 시 한 번 호출한다.
 *
 * 즐겨찾기가 없거나 전부 1등 이력이 없어 순위가 없으면 예약하지 않는다 - "명당랭킹이
 * 갱신됐어요" 같은 숫자 없는 알림은 무시당한다(스피또 주간알림과 같은 이유로, 숫자가
 * 있어야 열어본다).
 *
 * 알림 권한을 새로 요청하지 않는다 - 이미 허용한 사람에게만 간다.
 */
export async function scheduleRankingWeeklyReminder(): Promise<void> {
  if (!useNotificationSettings.getState().rankingWeekly) return;

  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  const favorites = Object.values(useFavorites.getState().stores);
  if (favorites.length === 0) return;

  const ranked = (
    await Promise.all(
      favorites.map(async (store) => {
        const { nation_rank } = await getStoreRankingStats(store.id);
        return nation_rank != null ? { store, rank: nation_rank } : null;
      }),
    )
  )
    .filter((v): v is { store: (typeof favorites)[number]; rank: number } => v !== null)
    .sort((a, b) => a.rank - b.rank)[0];

  if (!ranked) return;

  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: "🏆 이번 주 명당 랭킹 갱신",
      body: `즐겨찾기한 ${ranked.store.name}, 전국 ${ranked.rank}위예요. 다른 명당도 둘러보세요.`,
      sound: true,
      data: { type: "ranking-weekly" },
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextWeekdayAt(NOTIFY_WEEKDAY, NOTIFY_HOUR, new Date()),
    },
  });
}

/** 설정에서 이 알림을 끌 때 즉시 예약을 취소한다 - 끈 뒤에도 이미 잡힌 알림은 그대로 울린다. */
export async function cancelRankingWeeklyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
}
