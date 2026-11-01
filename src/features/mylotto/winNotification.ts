import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { winNotificationText, type WinToNotify } from "./winNotificationText";

// 보관함의 번호가 당첨으로 확인된 순간 알려준다.
//
// 왜 예약이 아니라 즉시 발송인가: 당첨 여부는 미리 알 수 없다. 추첨 결과를 받아 대조한
// 뒤에야 알 수 있으므로 "그 순간 보내기"밖에 방법이 없다.
//
// 그럼 앱을 열어야 알게 되는 거 아닌가 - 맞다. 대조(useAutoCheckTickets)는 앱이 열릴 때
// 돌기 때문에, 앱을 한 번도 안 열면 이 알림도 안 간다. 그래도 가치가 있는 이유는 알림이
// **트레이에 남는다**는 것이다. 토요일 추첨일 알림을 보고 앱을 열었다가 지도만 보고 닫은
// 사람도, 트레이에 "4등 5만원"이 남아 있으면 놓치지 않는다.
// 앱을 안 열어도 당첨을 알려주려면 서버 푸시(FCM)가 필요하다 - 그건 네이티브 빌드가
// 따로 필요해서 여기서는 못 한다.
//
// 끄기는 OS 알림 설정에서 이 채널만 따로 끌 수 있게 채널을 분리해 둔다. 앱 안에 토글을
// 또 만들지 않는 건, 당첨 알림을 받기 싫어하는 사람이 사실상 없기 때문이다.

const CHANNEL_ID = "win-alert";

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "당첨 알림",
    // 추첨일 알림과 같은 HIGH. 주간 정보 알림(DEFAULT)과 달리 지금 봐야 하는 소식이다.
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

/** 방금 확인된 당첨들을 한 건의 알림으로 알린다. 권한이 없으면 조용히 끝난다. */
export async function notifyWins(wins: readonly WinToNotify[]): Promise<void> {
  const text = winNotificationText(wins);
  if (!text) return;

  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: text.title,
      body: text.body,
      sound: true,
      data: { type: "win-alert" },
    },
    // 채널만 적은 trigger = "지금 보내되 이 채널로". channelId를 content에 적으면
    // 발송 자체가 실패한다(2026-11-01에 알림 4종이 전부 이 실수로 죽어 있었다).
    trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
  });
}
