import AsyncStorage from "@react-native-async-storage/async-storage";
import { reportError } from "./errorLog";

// expo-store-review는 네이티브 모듈이다(2026-11 빌드부터 들어감) - 최상위 import가 아니라
// 호출 시점에 require로 가져온다. inAppUpdate.ts와 같은 이유: 최상위에서 불러오면 그보다
// 구버전 껍데기에서 번들 로드 자체가 실패해 앱이 즉사하고, OTA 고립 탈출 안내도 못 뜬다.

const LAUNCH_COUNT_KEY = "store-review:launch-count";
const FIRST_LAUNCH_AT_KEY = "store-review:first-launch-at";
const REQUESTED_KEY = "store-review:requested";

const MIN_LAUNCHES = 3;
const MIN_DAYS_SINCE_INSTALL = 3;

export async function recordLaunch() {
  try {
    const countRaw = await AsyncStorage.getItem(LAUNCH_COUNT_KEY);
    const count = (countRaw ? Number(countRaw) : 0) + 1;
    await AsyncStorage.setItem(LAUNCH_COUNT_KEY, String(count));

    const firstLaunchAt = await AsyncStorage.getItem(FIRST_LAUNCH_AT_KEY);
    if (!firstLaunchAt) {
      await AsyncStorage.setItem(FIRST_LAUNCH_AT_KEY, String(Date.now()));
    }
  } catch (err) {
    reportError(err, "store-review-record-launch");
  }
}

// 리뷰 요청 실패가 당첨 확인 흐름을 깨면 안 되므로 전체를 try/catch로 감싼다. 조건을
// 하나라도 못 채우면 조용히 아무 일도 안 하고 끝난다.
export async function maybeRequestReview() {
  try {
    const [requested, countRaw, firstLaunchAtRaw] = await Promise.all([
      AsyncStorage.getItem(REQUESTED_KEY),
      AsyncStorage.getItem(LAUNCH_COUNT_KEY),
      AsyncStorage.getItem(FIRST_LAUNCH_AT_KEY),
    ]);
    if (requested) return;

    const count = countRaw ? Number(countRaw) : 0;
    if (count < MIN_LAUNCHES) return;

    const firstLaunchAt = firstLaunchAtRaw ? Number(firstLaunchAtRaw) : null;
    if (!firstLaunchAt) return;
    const daysSinceInstall = (Date.now() - firstLaunchAt) / (1000 * 60 * 60 * 24);
    if (daysSinceInstall < MIN_DAYS_SINCE_INSTALL) return;

    const StoreReview = require("expo-store-review") as typeof import("expo-store-review");
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    // requestReview() 호출 전에 먼저 저장한다 - 호출이 실패해도 다음 실행에서 또 시도하는
    // 재시도 루프를 막는다. 어차피 콜백으로 "실제로 평가했는지"는 알 수 없다.
    await AsyncStorage.setItem(REQUESTED_KEY, "1");
    await StoreReview.requestReview();
  } catch (err) {
    reportError(err, "store-review-request");
  }
}
