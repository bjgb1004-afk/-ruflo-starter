import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

// 화장실/ATM/편의점 같은 "판매점 주변" 시설은 자체 API 연동(키 발급, 호출량 관리,
// 캐싱) 없이 지도 앱 검색으로 위임한다.
//
// 처음엔 네이버지도 웹 검색에 좌표 중심(c=lng,lat,zoom)만 실어 보냈는데, 실기기에서
// "판매점 근처"가 아니라 "내 현재 위치 근처"로 계속 검색되는 문제가 있었다. WebBrowser로
// 강제로 웹페이지 상태로 열어도(네이버지도 앱으로 전환은 막았음) 재현됐던 것으로 보아,
// 원인은 앱 하이재킹이 아니라 네이버 검색 자체가 "내 주변" 순위를 URL의 지도 중심이
// 아니라 브라우저 Geolocation API(=기기의 실제 GPS)로 매기기 때문으로 보인다 - c= 파라미터는
// 지도 카메라 위치만 옮길 뿐 검색 기준점은 아니다.
// 카카오맵 URL Scheme 공식 문서(kakaomap://search?q=&p=)는 "지정된 좌표 중심으로
// 검색합니다"라고 명시하고 있어, 검색 기준점 자체가 좌표 파라미터로 보장된다.
export async function openNearbySearch(latitude: number, longitude: number, keyword: string) {
  const p = `${latitude},${longitude}`;
  const q = encodeURIComponent(keyword);
  const appUrl = `kakaomap://search?q=${q}&p=${p}`;

  if (await Linking.canOpenURL(appUrl)) {
    await Linking.openURL(appUrl);
    return;
  }

  // 카카오맵 앱 미설치 시 모바일 웹 스킴으로 폴백(공식 문서에 명시된 대체 URL).
  // Linking.openURL로 열면 Android가 이 도메인을 다른 지도 앱으로 가로챌 수 있어
  // (openDirections.ts와 동일한 문제), WebBrowser로 강제로 웹페이지 상태로 연다.
  const webUrl = `https://m.map.kakao.com/scheme/search?q=${q}&p=${p}`;
  await WebBrowser.openBrowserAsync(webUrl);
}
