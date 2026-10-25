import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getSpittoRounds, sellingRounds, remainingRatio } from "@/features/spitto/api/spittoApi";
import { nextFridayEvening } from "@/features/spitto/nextFridayEvening";

// 스피또 1등 잔여가 갱신되면 주 1회 알려준다.
//
// 왜 금요일인가: 동행복권이 입고율·잔여를 **금요일 기준 주 1회** 갱신한다. 갱신 직후이고
// 주말에 복권가게 가기 전이다. 토요일 저녁은 피한다 - 로또 추첨 알림(20:45)이 이미 가므로
// 같은 날 두 번 울리면 알림 피로가 쌓여 둘 다 꺼버린다.
//
// 왜 앱 열 때마다 다시 예약하나: 반복(WEEKLY) 트리거는 **예약한 순간의 문구가 박힌다.**
// 그러면 "스피또 현황 보러 오세요" 같은 숫자 없는 알림이 되고, 그건 무시당한다. 앱을 열 때
// 그 시점의 최신 숫자로 다시 예약하면 "1등 11매 모두 남음"처럼 구체적인 알림이 간다.
// identifier를 고정해 두므로 여러 번 열어도 예약이 쌓이지 않고 마지막 것이 덮어쓴다
// (drawReminders에서 같은 알림이 8개 동시 발송된 사고를 겪어 세운 규칙이다).

const REMINDER_ID = "spitto-weekly";
const CHANNEL_ID = "spitto-weekly";

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "스피또 현황 알림",
    // 추첨 알림(HIGH)보다 한 단계 낮춘다. 급한 소식이 아니라 주간 정보다.
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: "default",
  });
}

/**
 * 다음 금요일 알림을 지금 데이터로 다시 예약한다. 앱 시작 시 한 번 호출한다.
 *
 * 알림 권한을 **새로 요청하지 않는다.** 앱을 처음 연 사람에게 스피또 알림 권한을 묻는 건
 * 침입적이고, 거절당하면 정작 중요한 추첨 알림까지 같이 막힌다. 이미 허용한 사람에게만 간다.
 */
export async function scheduleSpittoWeeklyReminder(): Promise<void> {
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  const top = sellingRounds(await getSpittoRounds())[0];
  // 수집 전이거나 1등 잔여를 모르는 회차만 있으면 알릴 내용이 없다. 예약하지 않는다.
  if (!top || remainingRatio(top) < 0) return;

  const remaining = top.rank1_remaining as number;
  const total = top.rank1_total as number;
  const body =
    remaining === total
      ? `${top.game_name} ${top.round_no}회는 1등 ${total}매가 아직 그대로예요.`
      : `${top.game_name} ${top.round_no}회에 1등이 ${total}매 중 ${remaining}매 남았어요.`;

  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: "🎟️ 이번 주 스피또 1등 잔여",
      body,
      sound: true,
      data: { type: "spitto-weekly" },
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextFridayEvening(new Date()),
    },
  });
}
