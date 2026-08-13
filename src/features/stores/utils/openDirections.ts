import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

// 네이버지도는 몇 차례 수정해도 실기기에서 목적지가 안 채워진 빈 검색화면이 뜨는 문제가
// 계속 재현됐고(App Links 하이재킹으로 추정), 카카오맵은 실기기 테스트에서 정상 동작이
// 확인되어 카카오 하나로 통일한다 - 지도 앱이 두 개면 "이번엔 또 어느 쪽이 문제냐"를
// 매번 다시 진단해야 해서, 검증된 한쪽만 쓰는 게 더 안정적이다.
// 카카오맵 앱 미설치 시엔 동일 파라미터의 모바일 웹 스킴으로 폴백한다(공식 문서에 명시된
// 대체 URL). openNearbySearch.ts와 동일한 이유로 Linking.openURL 대신 WebBrowser로
// 강제 웹페이지 상태로 열어, Android가 이 도메인을 다른 지도 앱으로 가로채는 것을 막는다.
// name은 카카오 URL Scheme에서 좌표 매칭에 관여하지 않지만, 호출부(상세페이지)와의
// 시그니처 호환을 위해 인자로는 계속 받는다.
export async function openDirections(latitude: number, longitude: number, _name: string) {
  const p = `${latitude},${longitude}`;
  const appUrl = `kakaomap://route?ep=${p}&by=car`;

  if (await Linking.canOpenURL(appUrl)) {
    await Linking.openURL(appUrl);
    return;
  }

  const webUrl = `https://m.map.kakao.com/scheme/route?ep=${p}&by=car`;
  await WebBrowser.openBrowserAsync(webUrl);
}
