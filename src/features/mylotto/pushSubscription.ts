import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { reportError } from "@/lib/errorLog";
import type { GameType } from "@/features/qr/parseLottoQr";

const RESULT_CHANNEL_ID = "draw-result";

async function ensureResultChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(RESULT_CHANNEL_ID, {
    name: "당첨 결과 알림",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

let cachedToken: string | null = null;

// 추첨 전 티켓을 보관함에 저장할 때 호출한다. 로그인 없는 앱이라 기기의 Expo 푸시 토큰만
// 익명으로 서버에 등록해두고(번호와 함께), 서버 배치(sendMylottoNotifications.ts)가 추첨
// 직후 결과를 계산해 실제 당첨/낙첨 내용으로 푸시를 보낸다 - 로컬 알림(drawReminders.ts)은
// "확인해보세요" 정도만 가능하지만 이건 결과 자체를 담아 보낼 수 있다.
export async function registerResultPushSubscription(
  drawNo: number,
  games: { numbers: number[]; type: GameType | null }[],
): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return; // 권한 거부 - 조용히 건너뜀(로컬 리마인더는 별도로 동작)

    await ensureResultChannel();

    if (!cachedToken) {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      cachedToken = data;
    }
    const token = cachedToken;
    if (!token) return;

    const rows = games.map((g) => ({
      push_token: token,
      draw_no: drawNo,
      numbers: g.numbers,
      purchase_type: g.type,
    }));
    const { error } = await supabase.from("mylotto_push_subscriptions").insert(rows);
    if (error) throw error;
  } catch (err) {
    reportError(err, "mylotto-push-subscription");
  }
}
