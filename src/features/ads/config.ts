// 광고를 띄울지 말지를 정하는 한 곳.
//
// SDK(react-native-google-mobile-ads)는 네이티브라 빌드에 심어야 하지만, "지금 광고를
// 보여줄까"는 JS다. 그래서 빌드 없이 `eas update` 한 번으로 켜고 끈다.
//
// 코드에 박은 상수가 아니라 환경변수로 읽는다. 상수였을 때는 켜보려면 코드를 고쳐야 했고,
// 그 상태로 프로덕션에 배포가 한 번만 섞여도 유저 폰에 광고가 나가버린다. 환경변수면
// preview(내 폰)만 켜두고 production은 끈 채로 둘 수 있다 - 두 채널에 같은 코드를 올려도
// 각자 자기 값을 쓴다.
//
// 켜는 시점: 하루 활성 유저 100명. 그 전엔 들어올 돈이 사실상 0인데 첫인상만 깎인다
// (docs/ads-and-next-build.md의 계산 표 참고).

import Constants from "expo-constants";

/**
 * 광고를 띄울지. EAS 환경변수 `EXPO_PUBLIC_ADS_ENABLED`를 "true"로 두면 켜진다.
 * 없으면 꺼진 것으로 본다 - 실수로 켜지는 쪽보다 실수로 꺼지는 쪽이 안전하다.
 */
export const ADS_ENABLED: boolean = Constants.expoConfig?.extra?.adsEnabled === true;

/**
 * 실제 광고 유닛 ID. AdMob 콘솔에서 만들어 .env(EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID)에 넣는다.
 * 비어 있으면 광고를 그리지 않는다 - 잘못된 ID로 요청하면 AdMob이 계정에 경고를 준다.
 *
 * 시험용으로는 구글이 주는 공개 ID를 쓴다(계정 승인 전에도 항상 광고가 채워진다):
 *   ca-app-pub-3940256099942544/6300978111
 */
export const BANNER_UNIT_ID: string | undefined =
  Constants.expoConfig?.extra?.admobBannerUnitId || undefined;

/**
 * 보상형 광고(유저가 직접 눌러서 보고 번호를 더 뽑는) 유닛 ID.
 * 비어 있으면 보상형 광고 기능 자체가 없는 것으로 보고, 뽑기를 전부 공짜로 돌린다.
 */
export const REWARDED_UNIT_ID: string | undefined =
  Constants.expoConfig?.extra?.admobRewardedUnitId || undefined;

/** 광고를 그릴 조건. 둘 중 하나라도 없으면 화면에서 자리마저 차지하지 않는다. */
export function shouldShowAds(): boolean {
  return ADS_ENABLED && Boolean(BANNER_UNIT_ID);
}

/**
 * 보상형 광고를 요구해도 되는 빌드인지. 꺼져 있거나 유닛 ID가 없으면 false -
 * 그때는 광고를 못 보니 뽑기를 막아선 안 된다(막으면 기능이 사라진 것처럼 보인다).
 */
export function shouldGateWithRewardedAd(): boolean {
  return ADS_ENABLED && Boolean(REWARDED_UNIT_ID);
}
