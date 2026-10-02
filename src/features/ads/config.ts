// 광고를 띄울지 말지를 정하는 한 곳.
//
// SDK(react-native-google-mobile-ads)는 네이티브라 빌드에 심어야 하지만, "지금 광고를
// 보여줄까"는 JS다. 그래서 이 파일만 바꿔 `eas update`를 하면 빌드 없이 그날 바로 켜고 끈다.
//
// 지금은 꺼둔다. 2026-10-02 기준 가입 유저 1명·푸시 구독 0건이라, 띄워봐야 월 수백 원이고
// AdMob 지급 기준은 $100다. 들어올 돈은 0인데 첫 유저가 보는 첫인상만 나빠진다.
// 유저가 쌓이면 이 상수를 true로 바꾸고 OTA 한 번이면 된다.

import Constants from "expo-constants";

/** 켜려면 true로 바꾸고 `eas update`. 빌드는 필요 없다. */
export const ADS_ENABLED = false;

/**
 * 실제 광고 유닛 ID. AdMob 콘솔에서 만들어 .env(EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID)에 넣는다.
 * 비어 있으면 광고를 그리지 않는다 - 잘못된 ID로 요청하면 AdMob이 계정에 경고를 준다.
 */
export const BANNER_UNIT_ID: string | undefined =
  Constants.expoConfig?.extra?.admobBannerUnitId || undefined;

/** 광고를 그릴 조건. 둘 중 하나라도 없으면 화면에서 자리마저 차지하지 않는다. */
export function shouldShowAds(): boolean {
  return ADS_ENABLED && Boolean(BANNER_UNIT_ID);
}
