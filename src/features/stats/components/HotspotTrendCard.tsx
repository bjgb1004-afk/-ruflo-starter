import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getConsecutiveWinAreas } from "@/features/stats/api/regionalStatsApi";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";

interface Props {
  onPressSido: (sido: string) => void;
}

// "🔴 이번 달 HOT 지역"은 지도 화면에 그 시/도 중심 좌표 마커로 옮겨서 여기서는 뺐다
// (design.txt 요구사항 - 통계 화면과 지도에 같은 정보가 중복 표시되는 걸 피함).
// "최근 10주/전체 누적" 탭도 실제로 안 쓰인다는 피드백으로 없애서, 이 카드는 이제
// "⚡ 연속 당첨 지역" 배지만 보여주는 가벼운 하이라이트로 남는다.
export const HotspotTrendCard = memo(function HotspotTrendCard({ onPressSido }: Props) {
  const { data: streakAreas } = useQuery({
    queryKey: ["stats", "consecutive-win", 3],
    queryFn: () => getConsecutiveWinAreas(3),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  if (!streakAreas || streakAreas.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>⚡ 연속 당첨 지역</Text>
      <View style={styles.badgeRow}>
        {streakAreas.slice(0, 5).map((a) => (
          <Pressable key={`${a.sido}-${a.sigungu}`} style={styles.badge} onPress={() => onPressSido(a.sido)}>
            <Text style={styles.badgeText}>
              {a.sigungu} {a.streakWeeks}주 연속
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  title: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badge: {
    backgroundColor: colors.goldLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
});
