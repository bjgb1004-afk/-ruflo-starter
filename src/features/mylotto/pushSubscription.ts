import AsyncStorage from "@react-native-async-storage/async-storage";
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

// 직전에 서버에 등록한 푸시 주소. 폰의 푸시 주소는 영구적이지 않아(앱 데이터 삭제·재설치·
// FCM 갱신) 바뀔 수 있고, 바뀌면 그 전에 등록된 줄은 옛 주소를 들고 남는다. 발송은 주소로
// 묶으니 양쪽이 각각 한 통씩 가고, 옛 주소도 한동안 같은 폰에 배달된다 - 2026-11-07
// 1249회에 실제로 한 폰이 두 통을 받았다. 두 주소가 같은 폰인지 아는 건 폰 자신뿐이라,
// 직전 주소를 여기 적어두고 달라졌을 때 서버에 알려 옛 줄을 새 주소로 잇게 한다.
const LAST_TOKEN_KEY = "mylotto.lastPushToken";

/** 주소가 바뀌었으면 서버의 옛 줄을 새 주소로 옮긴다. 실패해도 등록은 계속한다. */
async function reconcileToken(token: string): Promise<void> {
  try {
    const previous = await AsyncStorage.getItem(LAST_TOKEN_KEY);
    if (previous === token) return;
    if (previous) {
      const { error } = await supabase.rpc("migrate_push_token", { p_old: previous, p_new: token });
      // 옮기기가 실패하면 알림이 두 통 갈 뿐이니, 주소를 새로 적어두는 건 미룬다 -
      // 다음 등록에서 다시 시도하게 둔다.
      if (error) throw error;
    }
    await AsyncStorage.setItem(LAST_TOKEN_KEY, token);
  } catch (err) {
    reportError(err, "mylotto-push-token-migrate");
  }
}

// 추첨 전 티켓을 보관함에 저장할 때 호출한다. 로그인 없는 앱이라 기기의 Expo 푸시 토큰만
// 익명으로 서버에 등록해두고(번호와 함께), 서버 배치(sendMylottoNotifications.ts)가 추첨
// 직후 결과를 계산해 실제 당첨/낙첨 내용으로 푸시를 보낸다 - 로컬 알림(drawReminders.ts)은
// "확인해보세요" 정도만 가능하지만 이건 결과 자체를 담아 보낼 수 있다.
//
// purchased는 일부러 필수다(useMyLottoTickets의 NewTicketInput과 같은 이유). 기본값을 두면
// 새 저장 경로를 붙일 때 조용히 빠져서, 안 산 번호에 "당첨을 축하합니다"가 가버린다.
export async function registerResultPushSubscription(
  drawNo: number,
  games: { numbers: number[]; type: GameType | null }[],
  purchased: boolean,
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
    // 토큰이 비면 조용히 끝내지 않는다 - 예전엔 그래서 "오류도 없고 등록도 0건"인 상태가
    // 되어 원인을 찾을 수가 없었다.
    if (!token) throw new Error("Expo 푸시 토큰이 비어 있음");

    await reconcileToken(token);

    // upsert가 아니라 한 줄씩 insert한다. upsert(=INSERT ON CONFLICT)는 "이미 있는 줄인지"
    // 보려고 표를 읽으려 하는데, 이 표는 select 정책이 일부러 없다(남의 번호와 알림 주소가
    // 들어 있어 아무나 읽으면 안 된다). 그래서 anon이 upsert하면 RLS에 걸려 전부 실패했다 -
    // 2026-08부터 이 표가 0행이었던 이유다(2026-11-01에 실측으로 확인:
    // 일반 insert는 통과, on conflict는 do nothing/do update 모두 42501).
    //
    // 읽기를 열어 해결하지 않는다. 그러면 누구나 모든 사용자의 번호를 볼 수 있다.
    //
    // 한 줄씩 보내는 이유: 여러 줄을 한 번에 보내면 그중 하나가 중복일 때 전부 실패한다
    // (같은 용지를 다시 스캔하면 실제로 그렇게 된다). 한 장은 보통 1~5게임이라 요청 몇 개는
    // 저장 버튼을 누른 순간에만 생기고 끝이다.
    // 같은 번호가 한 용지에 여러 장 있으면(흔한 구매 방식) 몇 번째 장인지 함께 보낸다.
    // 이게 없으면 유니크 제약에 걸려 한 장분만 등록되고, 알림은 "1게임 5,000원"인데
    // 보관함은 "3게임 15,000원"이라고 해서 같은 앱이 돈에 대해 다른 말을 한다.
    const copyNoByNumbers = new Map<string, number>();
    const rows = games.map((g) => {
      const key = g.numbers.join(",");
      const copyNo = (copyNoByNumbers.get(key) ?? 0) + 1;
      copyNoByNumbers.set(key, copyNo);
      return {
        push_token: token,
        draw_no: drawNo,
        numbers: g.numbers,
        purchase_type: g.type,
        purchased,
        copy_no: copyNo,
      };
    });
    const results = await Promise.all(
      rows.map((row) => supabase.from("mylotto_push_subscriptions").insert(row)),
    );
    // 23505 = unique 제약 위반. 이미 등록된 번호라는 뜻이니 성공으로 본다.
    const failed = results.find((r) => r.error && r.error.code !== "23505");
    if (failed?.error) throw failed.error;
  } catch (err) {
    reportError(err, "mylotto-push-subscription");
  }
}
