import { Platform } from "react-native";
import SpInAppUpdates, { IAUUpdateKind } from "sp-react-native-in-app-updates";
import { reportError } from "./errorLog";

// Play 스토어로 설치된 바이너리에서만 동작한다(Play Core API) - 사이드로드/개발 빌드는
// 조용히 아무 일도 안 하고 빠진다. iOS는 앱을 아직 출시하지 않아 대상이 아니다.
// IMMEDIATE라 유저는 업데이트 없이 앱을 계속 쓸 수 없다 - 버전 간 호환이 깨지는 변경에만 쓸 것.
export async function checkForNativeUpdate() {
  if (Platform.OS !== "android") return;
  try {
    const inAppUpdates = new SpInAppUpdates(false);
    const { shouldUpdate } = await inAppUpdates.checkNeedsUpdate();
    if (!shouldUpdate) return;
    await inAppUpdates.startUpdate({ updateType: IAUUpdateKind.IMMEDIATE });
  } catch (err) {
    reportError(err, "in-app-update-check");
  }
}
