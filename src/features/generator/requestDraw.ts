import { shouldGateWithRewardedAd } from "@/features/ads/config";
import { showRewardedAd } from "@/features/ads/showRewardedAd";
import { hasFreeDraw, useDrawCredits, type DrawCreditsState } from "./useDrawCredits";

// "한 번 더 뽑기"를 눌렀을 때 뽑게 해줄지 정한다. 왜 뽑게 해줬는지까지 돌려줘서
// 화면이 알맞은 말을 띄울 수 있게 한다.
//
// 어떤 경우에도 뽑기를 막지 않는다. 광고가 안 붙은 빌드거나 광고 재고가 없을 때 막으면
// 유저 눈에는 기능이 고장난 것으로 보이는데, 정작 우리가 버는 돈은 0이다.

export type DrawPermission =
  // 광고 기능이 없는 빌드(또는 광고를 끈 상태) - 전부 공짜
  | "ads-off"
  // 이 회차 이 버튼의 공짜 한 번
  | "free"
  // 광고 보고 열어둔 1시간 안
  | "pass"
  // 방금 광고를 끝까지 봤다 - 1시간이 열렸다
  | "rewarded"
  // 광고를 못 띄웠다(재고 없음·오프라인·중간에 닫음) - 이번 한 번만 그냥 준다
  | "ad-unavailable";

export async function requestDraw(key: string, drawNo: number): Promise<DrawPermission> {
  if (!shouldGateWithRewardedAd()) return "ads-off";

  const credits = useDrawCredits.getState();
  if (credits.hasPass()) return "pass";
  if (credits.spendFree(key, drawNo)) return "free";

  const result = await showRewardedAd();
  if (result === "earned") {
    useDrawCredits.getState().startPass();
    return "rewarded";
  }
  return "ad-unavailable";
}

/**
 * 그 버튼을 누르면 광고를 보게 되는지. 버튼 문구를 미리 바꾸는 데만 쓴다 -
 * 누르기 전에 광고가 나올 걸 알려주는 게 유저에게도, AdMob 정책에도 맞다.
 */
export function needsAdForDraw(state: DrawCreditsState, key: string, drawNo: number): boolean {
  if (!shouldGateWithRewardedAd()) return false;
  if (Date.now() < state.passUntil) return false;
  return !hasFreeDraw(state, key, drawNo);
}
