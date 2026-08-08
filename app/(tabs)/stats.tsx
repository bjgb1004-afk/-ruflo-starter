import { StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { HotspotTrendCard } from "@/features/stats/components/HotspotTrendCard";
import { RecentDrawSummary } from "@/features/stats/components/RecentDrawSummary";
import { LuckDensityList } from "@/features/stats/components/LuckDensityList";
import { colors, spacing } from "@/constants/theme";

// "지역별 당첨 통계"(1등/2등 막대그래프) 섹션은 명당 밀도(LuckDensityList)와 내용이
// 상당 부분 겹쳐서 삭제 - 같은 정보를 두 군데서 다른 모양으로 또 보여줄 필요가 없다는
// 피드백(design.txt)을 반영했다.
export default function StatsScreen() {
  const router = useRouter();
  const handleRegionPress = useCallback(
    (sido: string) => {
      router.push({ pathname: "/(tabs)/ranking", params: { sido } });
    },
    [router],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ⚡ 연속 당첨 지역 배지 - 🔴 이번 달 HOT은 지도 화면 마커로 옮겨서 여기선 뺐다 */}
      <HotspotTrendCard onPressSido={handleRegionPress} />

      {/* 회차별 당첨현황 - 1회부터 최신 회차까지 드롭다운으로 조회 + 배출업소 아코디언 */}
      <RecentDrawSummary />

      {/* 지역별 명당 밀도(행운 지수) - 카드를 펼치면 자동/수동/반자동 비율도 함께 보임 */}
      <LuckDensityList onPressSido={handleRegionPress} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contentContainer: { padding: spacing.lg, gap: spacing.xl },
});
