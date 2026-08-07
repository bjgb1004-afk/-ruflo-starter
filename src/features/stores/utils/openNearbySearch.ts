import * as WebBrowser from "expo-web-browser";

// 화장실/ATM/편의점 같은 "판매점 주변" 시설은 자체 API 연동(키 발급, 호출량 관리,
// 캐싱) 없이, 네이버지도 웹 검색에 좌표 중심(c=lng,lat,zoom)을 함께 넘겨 딥링크로
// 위임한다.
//
// 처음엔 Linking.openURL로 열었는데, 네이버지도 "앱"이 설치돼 있으면 OS가 자동으로
// 앱으로 넘겨버리고, 앱은 URL의 좌표(c=)보다 기기의 실시간 GPS 위치를 우선시해서
// "판매점 근처"가 아니라 "내 현재 위치 근처"로 검색되는 문제가 있었다.
// WebBrowser(인앱 브라우저)로 강제로 웹페이지 상태로 열면 네이버지도 앱으로
// 전환되지 않아, 웹페이지가 실제로 URL에 담긴 좌표를 기준으로 렌더링된다.
export async function openNearbySearch(latitude: number, longitude: number, keyword: string) {
  const url = `https://map.naver.com/v5/search/${encodeURIComponent(keyword)}?c=${longitude},${latitude},16,0,0,0,dh`;
  await WebBrowser.openBrowserAsync(url);
}
