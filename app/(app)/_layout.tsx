import { Pressable, StyleSheet, Text } from "react-native";
import { Stack, useRouter } from "expo-router";
import { colors, spacing } from "@/constants/theme";

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
  menuButton: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm },
  menuLabel: { color: colors.textMuted, fontSize: 11 },
  menuIcon: { color: colors.textPrimary, fontSize: 20, fontWeight: "700", lineHeight: 22 },
});
