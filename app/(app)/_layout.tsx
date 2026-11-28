import { Pressable, StyleSheet, Text } from "react-native";
import { Stack, useRouter } from "expo-router";
import { colors, spacing, radius } from "@/constants/theme";

// 아래 탭바를 없앴다(2026-11-28). 탭 네 칸 + 광고 배너가 화면 아래 두 줄을 먹고 있었는데,
// 그 네 칸 중 실제로 쓰이는 건 당첨확인과 지도뿐이었다. 랭킹·더보기는 상단 ≡ 한 곳으로
// 모으고, 홈에는 "내가 됐나?"의 답과 버튼 두 개만 남겼다.
//
// 메뉴를 떠오르는 오버레이가 아니라 밀어 올리는 화면(/more)으로 둔 이유: 보여줄 게
// 목록 한 장뿐인데 오버레이는 뒤로가기·애니메이션을 직접 써야 한다. 화면으로 두면
// 안드로이드 뒤로가기 버튼이 그냥 동작한다.
const MenuButton = () => {
  const router = useRouter();
  return (
    <Pressable style={styles.menuButton} hitSlop={12} onPress={() => router.push("/more")}>
      <Text style={styles.menuLabel}>더보기</Text>
      <Text style={styles.menuIcon}>≡</Text>
    </Pressable>
  );
};

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        // 헤더를 종이색으로 둔다(2026-11-28). 먹색으로 깔았더니 화면 위쪽이 검은 덩어리로
        // 보였고, 상태표시줄 아이콘이 짙은 색으로 고정돼 있어(루트의 SystemBars style="dark")
        // 시계·배터리가 그 검정 위에서 아예 안 보였다. 밝은 헤더라야 그 고정값과 맞는다.
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "800" },
        headerShadowVisible: false,
        headerRight: () => <MenuButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: "복권명당" }} />
      <Stack.Screen name="map" options={{ title: "지도" }} />
      <Stack.Screen name="ranking" options={{ title: "명당 랭킹" }} />
      {/* 더보기 하위 화면들은 자기 Stack(more/_layout.tsx)에서 헤더를 관리한다 -
          여기서도 그리면 헤더가 두 줄로 겹친다. */}
      <Stack.Screen name="more" options={{ headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  // 흐린 회색 11px 글씨였더니 헤더에 묻혀 안 보였다 - 앱의 다른 화면 전부가 이 버튼
  // 하나 뒤에 있으니 "눌러도 되는 것"으로 읽혀야 한다. 흰 알약 + 금색 테두리로 띄운다
  // (종이색 배경 위에서 흰색이 뜨고, 테두리가 버튼 모양을 만든다). 금색으로 꽉 채우지
  // 않은 이유는 홈의 큰 QR 버튼이 이미 금색이라 둘이 서로 세기를 깎기 때문이다.
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
  },
  menuLabel: { color: colors.primaryDark, fontSize: 13, fontWeight: "800" },
  menuIcon: { color: colors.primaryDark, fontSize: 17, fontWeight: "700", lineHeight: 19 },
});
