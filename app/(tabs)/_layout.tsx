import { Text } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/theme";

// 탭 아이콘을 지정하지 않으면 일부 기기에서 빈 사각형(깨진 아이콘)으로 표시된다.
// 이모지로 지정해 별도 아이콘 에셋 없이도 안전하게 렌더링되도록 한다.
const TabIcon = ({ emoji, focused }: { emoji: string; focused: boolean }) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "지도", tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} /> }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: "명당 랭킹",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏆" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "즐겨찾기",
          tabBarIcon: ({ focused }) => <TabIcon emoji="⭐" focused={focused} />,
        }}
      />
      {/* QR 당첨확인 - 더보기 하위 메뉴에 묻혀 있던 걸 즐겨찾기 옆 탭으로 이동(design.txt
          요구사항). 카메라 화면이라 몰입감을 위해 헤더는 숨긴다. */}
      <Tabs.Screen
        name="scan"
        options={{
          title: "당첨확인",
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔳" focused={focused} />,
        }}
      />
      {/* 지역 통계/설정은 탭바에서 빼서 "더보기" 하위 메뉴로 옮긴다(design.txt 요구사항).
          href: null로 탭바 노출만 숨기고 라우트 자체는 유지해, 더보기 화면에서 router.push로
          그대로 이동할 수 있게 한다. */}
      <Tabs.Screen name="stats" options={{ title: "지역 통계", href: null }} />
      <Tabs.Screen name="settings" options={{ title: "설정", href: null }} />
      <Tabs.Screen
        name="more"
        options={{
          title: "더보기",
          // 이모지(⋯)는 iOS/Android 폰트 렌더링 차이로 세로 정렬이 어긋날 수 있어
          // 벡터 아이콘으로 대체 - 다른 탭과 달리 텍스트 글리프가 아니라 SVG라 플랫폼 간 일관됨.
          // color는 tabBarActiveTintColor/tabBarInactiveTintColor가 자동으로 넘겨준다.
          tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
