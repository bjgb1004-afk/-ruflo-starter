import { Linking } from "react-native";

// 네이버지도(국내 MAU 1위) → 카카오맵 → 둘 다 미설치 시 네이버지도 웹(도보/대중교통
// 정확도가 구글맵보다 높음) 순으로 시도한다.
// 딥링크 스킴은 대상 앱이 설치돼 있지 않으면 canOpenURL이 false를 반환하므로 순차 폴백한다.
//
// dname(목적지 이름) 파라미터를 넣으면, 네이버/카카오 지도가 좌표보다 "이름이 일치하는
// 전국의 다른 장소"를 우선 매칭하는 것으로 실기기 테스트에서 확인됨 — "복권명당", "스파"처럼
// 흔한 상호명은 전국에 동명 매장이 수십 개라 완전히 엉뚱한 곳(다른 도시의 동명 매장, 목욕탕 등)
// 으로 안내되고, 등록 안 된 이름은 "결과 없음"이 뜬다. 이름 파라미터를 빼고 좌표만 넘기면
// 이름 매칭이 개입할 여지가 없어진다.
// name은 좌표 매칭에 관여하지 않도록 URL에서 뺐지만, 호출부(상세페이지)와의 시그니처
// 호환을 위해 인자로는 계속 받는다.
export async function openDirections(latitude: number, longitude: number, _name: string) {
  const naverUrl = `nmap://route/walk?dlat=${latitude}&dlng=${longitude}&appname=com.lottomap.app`;
  const kakaoUrl = `kakaomap://route?ep=${latitude},${longitude}&by=FOOT`;
  const naverWebUrl = `https://map.naver.com/v5/directions/-/${longitude},${latitude},,,/-/walk`;

  if (await Linking.canOpenURL(naverUrl)) {
    await Linking.openURL(naverUrl);
    return;
  }
  if (await Linking.canOpenURL(kakaoUrl)) {
    await Linking.openURL(kakaoUrl);
    return;
  }
  await Linking.openURL(naverWebUrl);
}
