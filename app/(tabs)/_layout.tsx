import { Text, View } from "react-native";
import { Tabs } from "expo-router";
import { BottomTabBar, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { AdBanner } from "@/features/ads/AdBanner";
import { colors } from "@/constants/theme";

// 탭 아이콘을 지정하지 않으면 일부 기기에서 빈 사각형(깨진 아이콘)으로 표시된다.
// 이모지로 지정해 별도 아이콘 에셋 없이도 안전하게 렌더링되도록 한다.
const TabIcon = ({ emoji, focused }: { emoji: string; focused: boolean }) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
);

// 배너를 탭바 "위"에 붙인다. 탭 네 개(지도/랭킹/당첨확인/더보기)와 더보기 하위 화면이
// 전부 이 한 줄을 공유한다 - 화면마다 따로 달면 빠뜨리는 화면이 생긴다.
//
// 탭바 아래가 아니라 위인 이유: 누르는 버튼 바로 밑에 광고를 두면 오터치가 광고 클릭으로
// 잡히고, 애드몹은 그걸 무효 트래픽으로 보고 계정에 경고를 준다.
const TabBarWithAd = (props: BottomTabBarProps) => (
  <View>
    <AdBanner />
    <BottomTabBar {...props} />
  </View>
);

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={TabBarWithAd}
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      {/* 첫 화면은 당첨확인이다. 이 분야에서 앱을 켜는 이유 1번은 "내가 됐나?"라서,
          지도를 먼저 띄우면 당첨확인으로 들어온 사람이 엉뚱한 지역 지도와 위치 권한
          요청을 먼저 본다(2026-11-26 경쟁앱 비교에서 확인). 지도는 두 번째 탭으로
          내렸고, 탭은 기본이 lazy라 지도 탭을 누를 때까지 위치 권한도 묻지 않는다.
          카메라 화면이라 몰입감을 위해 헤더는 숨긴다. */}
      <Tabs.Screen
        name="index"
        options={{
          title: "당첨확인",
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon emoji="📷" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: "지도", tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} /> }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: "명당 랭킹",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏆" focused={focused} />,
        }}
      />
      {/* 즐겨찾기/회차별 당첨현황/설정은 탭바에 안 보이고 "더보기" 하위 스택
          (app/(tabs)/more/_layout.tsx)에서 화면과 헤더를 관리한다. 이 탭의 headerShown을
          꺼서 하위 스택 헤더와 중복되지 않게 한다. */}
      <Tabs.Screen
        name="more"
        options={{
          title: "더보기",
          headerShown: false,
          // 이모지(⋯)는 iOS/Android 폰트 렌더링 차이로 세로 정렬이 어긋날 수 있어
          // 벡터 아이콘으로 대체 - 다른 탭과 달리 텍스트 글리프가 아니라 SVG라 플랫폼 간 일관됨.
          // color는 tabBarActiveTintColor/tabBarInactiveTintColor가 자동으로 넘겨준다.
          tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
