import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

// 네이버지도(국내 MAU 1위) → 카카오맵 → 둘 다 미설치 시 네이버지도 웹(도보/대중교통
// 정확도가 구글맵보다 높음) 순으로 시도한다.
// 딥링크 스킴은 대상 앱이 설치돼 있지 않으면 canOpenURL이 false를 반환하므로 순차 폴백한다.
//
// dname(목적지 이름) 파라미터를 넣으면, 네이버/카카오 지도가 좌표보다 "이름이 일치하는
// 전국의 다른 장소"를 우선 매칭하는 것으로 실기기 테스트에서 확인됨 — "복권명당", "스파"처럼
// 흔한 상호명은 전국에 동명 매장이 수십 개라 완전히 엉뚱한 곳(다른 도시의 동명 매장, 목욕탕 등)
// 으로 안내되고, 등록 안 된 이름은 "결과 없음"이 뜬다. 이름 파라미터를 빼고 좌표만 넘기면
// 이름 매칭이 개입할 여지가 없어진다. 네이버 공식 URL Scheme 문서상 dname은 선택값이라
// 생략하면 도착지 주소로 표시되는 게 정상 동작이다(dlat/dlng는 필수, 둘 다 넘기고 있음).
// name은 좌표 매칭에 관여하지 않도록 URL에서 뺐지만, 호출부(상세페이지)와의 시그니처
// 호환을 위해 인자로는 계속 받는다.
export async function openDirections(latitude: number, longitude: number, _name: string) {
  const naverUrl = `nmap://route/walk?dlat=${latitude}&dlng=${longitude}&appname=com.lottomap.app`;
  // 카카오맵 공식 URL Scheme 문서의 by 값은 소문자(car/publictransit/foot/bicycle) -
  // 대문자 FOOT는 스펙 밖의 값이라 무시되고 기본 이동수단(자동차)으로 열렸을 가능성이 있다.
  const kakaoUrl = `kakaomap://route?ep=${latitude},${longitude}&by=foot`;
  const naverWebUrl = `https://map.naver.com/v5/directions/-/${longitude},${latitude},,,/-/walk`;

  if (await Linking.canOpenURL(naverUrl)) {
    await Linking.openURL(naverUrl);
    return;
  }
  if (await Linking.canOpenURL(kakaoUrl)) {
    await Linking.openURL(kakaoUrl);
    return;
  }
  // "몇 번을 고쳐도 목적지가 안 채워진 빈 검색화면이 뜬다"는 재발 원인 추정: 네이버지도
  // 앱 둘 다 미설치일 때 Linking.openURL(naverWebUrl)로 열면, Android가 map.naver.com
  // 도메인을 App Links로 네이버지도 앱에 가로채 넘길 수 있는데, 앱이 이 웹 전용 URL
  // 포맷(/v5/directions/-/lng,lat,,,/-/walk)을 완전히 지원하지 못해 빈 경로검색 화면으로
  // 열리는 것으로 보인다(openNearbySearch.ts에서 실제로 확인된 것과 같은 종류의 하이재킹).
  // WebBrowser로 강제로 "웹페이지" 상태로 열면 앱으로 전환되지 않아 URL의 좌표가 그대로 반영된다.
  await WebBrowser.openBrowserAsync(naverWebUrl);
}
