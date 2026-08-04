import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getLatestDraw } from "@/features/draws/api/drawHistoryApi";

export default function StatsScreen() {
  const { data: latestDraw } = useQuery({
    queryKey: ["draws", "latest"],
    queryFn: getLatestDraw,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>최근 회차 정보</Text>
      {latestDraw ? (
        <Text style={styles.body}>
          {latestDraw.draw_no}회 ({latestDraw.draw_date}) ·{" "}
          {latestDraw.winning_numbers.join(", ")} + {latestDraw.bonus_number}
        </Text>
      ) : (
        <Text style={styles.body}>불러오는 중...</Text>
      )}
      {/* TODO: 시/도, 시/군/구별 1·2등 배출 통계 차트/리스트 */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 15, color: "#333" },
});
