import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "지도" }} />
      <Tabs.Screen name="ranking" options={{ title: "명당 랭킹" }} />
      <Tabs.Screen name="stats" options={{ title: "지역 통계" }} />
    </Tabs>
  );
}
