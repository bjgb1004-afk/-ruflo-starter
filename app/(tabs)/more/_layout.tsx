import { Stack } from "expo-router";

// 즐겨찾기/회차별 당첨현황/설정을 "더보기" 탭의 하위 스택으로 둔다. 이전엔 이 셋이
// (tabs)/_layout.tsx에서 형제 Tabs.Screen(href: null)이었는데, 그러면 더보기에서
// router.push로 들어가는 게 스택 push가 아니라 "탭 전환"이 되어 뒤로가기를 누르면
// 더보기로 안 돌아가고 탭 back-behavior에 따라 첫 탭(지도)으로 튕기는 문제가 있었다.
// 하위 스택으로 두면 뒤로가기가 정상적으로 더보기 메뉴로 pop된다.
export default function MoreLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "더보기" }} />
      <Stack.Screen name="favorites" options={{ title: "즐겨찾기" }} />
      <Stack.Screen name="stats" options={{ title: "회차별 당첨현황" }} />
      <Stack.Screen name="settings" options={{ title: "앱 설정" }} />
    </Stack>
  );
}
