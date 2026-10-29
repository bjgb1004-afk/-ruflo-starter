import { Stack } from "expo-router";

// 홈 화면 띠(HomeBannerCarousel)처럼 **다른 탭에서** 더보기 안쪽 화면으로 바로 들어오는 길이
// 있다. 그때 이 앵커가 없으면 스택에 그 화면 하나만 올라가 뒤로가기 버튼이 아예 안 생기고,
// 유저가 더보기 메뉴로 돌아갈 방법이 없어진다(2026-10-25 스피또에서 실제로 발생).
// 앵커를 index로 두면 어느 길로 들어와도 메뉴 화면이 아래에 깔린다.
export const unstable_settings = { anchor: "index" };

// 즐겨찾기/회차별 당첨현황/설정을 "더보기" 탭의 하위 스택으로 둔다. 이전엔 이 셋이
// (tabs)/_layout.tsx에서 형제 Tabs.Screen(href: null)이었는데, 그러면 더보기에서
// router.push로 들어가는 게 스택 push가 아니라 "탭 전환"이 되어 뒤로가기를 누르면
// 더보기로 안 돌아가고 탭 back-behavior에 따라 첫 탭(지도)으로 튕기는 문제가 있었다.
// 하위 스택으로 두면 뒤로가기가 정상적으로 더보기 메뉴로 pop된다.
//
// **화면을 새로 추가하면 여기에 Stack.Screen 한 줄도 반드시 같이 추가할 것.** 빠뜨리면
// 헤더 제목이 파일명 그대로(예: "spitto") 영어로 뜬다 — 스피또가 그랬다.
export default function MoreLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "더보기" }} />
      <Stack.Screen name="generator" options={{ title: "천재들의 한수" }} />
      <Stack.Screen name="spitto" options={{ title: "스피또 현황" }} />
      <Stack.Screen name="favorites" options={{ title: "즐겨찾기" }} />
      <Stack.Screen name="stats" options={{ title: "회차별 당첨현황" }} />
      <Stack.Screen name="settings" options={{ title: "앱 설정" }} />
    </Stack>
  );
}
