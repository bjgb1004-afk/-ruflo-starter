import { Platform } from "react-native";
import { reportError } from "./errorLog";

// Play 스토어로 설치된 바이너리에서만 동작한다(Play Core API) - 사이드로드/개발 빌드는
// 조용히 아무 일도 안 하고 빠진다. iOS는 앱을 아직 출시하지 않아 대상이 아니다.
// FLEXIBLE이라 다운로드는 배경에서 받고, 받는 동안에도 앱을 계속 쓸 수 있다 - 다 받으면
// installUpdate()로 설치를 마무리한다(기기에 따라 재시작을 묻는 배너가 뜬다).
//
// 네이티브 모듈을 최상위 import가 아니라 호출 시점에 require로 가져온다. 이 모듈은
// 2026-10-13(versionCode 3)에 들어갔으므로 그 이전 껍데기에는 없다 - 최상위에서
// 불러오면 그 폰에서 번들 로드 자체가 실패해 앱이 즉사한다. 구버전 껍데기에 갇힌
// 유저에게 안내를 보내려면 같은 번들이 양쪽 껍데기에서 다 떠야 하고, 그러려면
// "없는 부품을 부르는 코드"가 import 그래프에 없어야 한다. 광고 모듈(AdBanner,
// showRewardedAd)이 같은 이유로 이미 이 방식을 쓴다.
export async function checkForNativeUpdate() {
  if (Platform.OS !== "android") return;
  try {
    const { default: SpInAppUpdates, IAUInstallStatus, IAUUpdateKind } =
      require("sp-react-native-in-app-updates") as typeof import("sp-react-native-in-app-updates");
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
