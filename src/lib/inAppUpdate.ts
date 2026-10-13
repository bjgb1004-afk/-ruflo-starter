import { Platform } from "react-native";
import SpInAppUpdates, { IAUInstallStatus, IAUUpdateKind } from "sp-react-native-in-app-updates";
import { reportError } from "./errorLog";

// Play 스토어로 설치된 바이너리에서만 동작한다(Play Core API) - 사이드로드/개발 빌드는
// 조용히 아무 일도 안 하고 빠진다. iOS는 앱을 아직 출시하지 않아 대상이 아니다.
// FLEXIBLE이라 다운로드는 배경에서 받고, 받는 동안에도 앱을 계속 쓸 수 있다 - 다 받으면
// installUpdate()로 설치를 마무리한다(기기에 따라 재시작을 묻는 배너가 뜬다).
export async function checkForNativeUpdate() {
  if (Platform.OS !== "android") return;
  try {
    const inAppUpdates = new SpInAppUpdates(false);
    const { shouldUpdate } = await inAppUpdates.checkNeedsUpdate();
    if (!shouldUpdate) return;
    inAppUpdates.addStatusUpdateListener((status) => {
      if (status.status === IAUInstallStatus.DOWNLOADED) {
        inAppUpdates.installUpdate();
      }
    });
    await inAppUpdates.startUpdate({ updateType: IAUUpdateKind.FLEXIBLE });
  } catch (err) {
    reportError(err, "in-app-update-check");
  }
}
