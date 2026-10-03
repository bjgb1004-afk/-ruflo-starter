import { reportError } from "@/lib/errorLog";
import { REWARDED_UNIT_ID, shouldGateWithRewardedAd } from "./config";

// 보상형 광고 한 편을 띄우고, 유저가 끝까지 봤는지 알려준다.
//
// 네이티브 모듈을 파일 맨 위에서 import하지 않는다 - SDK가 없는 빌드에서는 그 한 줄로 앱이
// 통째로 죽는다(AdBanner.tsx와 같은 이유).
//
// 광고를 못 띄운 경우와 유저가 중간에 닫은 경우를 구별하지 않고 둘 다 "unavailable"로 본다.
// 부르는 쪽은 그때 번호를 한 번 그냥 내준다 - 광고 재고는 유저 잘못이 아니고, 막아도
// 우리가 벌 돈이 없는데 기능만 고장난 것처럼 보인다.

export type RewardedAdResult = "earned" | "unavailable";

// 광고를 띄우는 데 이보다 오래 걸리면 포기한다. 유저는 버튼을 누르고 기다리는 중이다.
const LOAD_TIMEOUT_MS = 8_000;

export async function showRewardedAd(): Promise<RewardedAdResult> {
  const unitId = REWARDED_UNIT_ID;
  if (!shouldGateWithRewardedAd() || !unitId) return "unavailable";

  let mod: typeof import("react-native-google-mobile-ads");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("react-native-google-mobile-ads");
    await mod.MobileAds().initialize();
  } catch (err) {
    // SDK가 빌드에 없거나 초기화 실패. 광고 없이 넘어간다.
    reportError(err, "ads:rewarded-unavailable");
    return "unavailable";
  }

  return new Promise<RewardedAdResult>((resolve) => {
    const ad = mod.RewardedAd.createForAdRequest(unitId);
    let earned = false;
    let settled = false;

    const finish = (result: RewardedAdResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ad.removeAllListeners();
      resolve(result);
    };

    const timer = setTimeout(() => finish("unavailable"), LOAD_TIMEOUT_MS);

    ad.addAdEventListener(mod.RewardedAdEventType.LOADED, () => {
      ad.show().catch((err: unknown) => {
        reportError(err, "ads:rewarded-show-failed");
        finish("unavailable");
      });
    });
    // 보상은 광고를 끝까지 본 순간에 뜬다. 창이 닫힐 때 이 값으로 판정한다.
    ad.addAdEventListener(mod.RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });
    ad.addAdEventListener(mod.AdEventType.CLOSED, () => finish(earned ? "earned" : "unavailable"));
    ad.addAdEventListener(mod.AdEventType.ERROR, () => finish("unavailable"));

    ad.load();
  });
}
