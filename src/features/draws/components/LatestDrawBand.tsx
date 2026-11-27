import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { LottoBall } from "@/components/LottoBall";
import { getLatestDraw } from "@/features/draws/api/drawHistoryApi";
import { colors, spacing, radius } from "@/constants/theme";

/**
 * 최신 회차 당첨번호 한 줄. 당첨확인(첫) 화면 맨 위에 붙는다.
 *
 * 왜 필요한가(2026-11-26): 앱을 켜는 이유 1번은 "내가 됐나?"인데, 예전 첫 화면은 지도였고
 * 당첨확인 화면에 들어가도 카메라만 떠서 **이번 회차 번호가 앱 어디에도 없었다.** 경쟁앱
 * (100만 다운로드)은 켜자마자 번호 6개가 보인다. 카메라 권한이 없어도 이 띠는 보여야
 * 한다 - 설치 직후 권한을 거부/보류한 사람에게 빈 화면만 남으면 거기서 앱을 지운다.
 *
 * 쿼리키는 RecentDrawSummary(회차별 당첨현황)와 같은 ["draws","latest"]를 쓴다 - 두 화면이
 * 같은 캐시를 공유해 추가 요청이 생기지 않는다.
 */
export function LatestDrawBand() {
  const router = useRouter();
  const { data: draw, isError, refetch } = useQuery({
    queryKey: ["draws", "latest"],
    queryFn: getLatestDraw,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  if (isError) {
    return (
      <Pressable style={styles.band} onPress={() => refetch()}>
        <Text style={styles.errorText}>당첨번호를 불러오지 못했어요 · 눌러서 다시 시도</Text>
      </Pressable>
    );
  }

  // 로딩 중에는 자리만 비워둔다. 스켈레톤을 깜빡이면 카메라가 뜨는 순간과 겹쳐
  // 화면이 두 번 덜컹거린다(캐시가 있으면 보통 즉시 채워진다).
  if (!draw) return <View style={styles.bandPlaceholder} />;

  return (
    <Pressable style={styles.band} onPress={() => router.push("/more/stats")}>
      <View style={styles.headerRow}>
        <Text style={styles.round}>{draw.draw_no}회 당첨번호</Text>
        <Text style={styles.date}>{draw.draw_date} ›</Text>
      </View>
      <View style={styles.ballsRow}>
        {draw.winning_numbers.map((num) => (
          <LottoBall key={num} number={num} size="small" />
        ))}
        <Text style={styles.plusSign}>+</Text>
        <LottoBall number={draw.bonus_number} isBonus size="small" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 카메라 화면 배경이 검정이라 띠도 어두운 먹색으로 둔다 - 흰 카드를 얹으면 화면 위쪽에
  // 밝은 덩어리가 생겨 카메라 뷰파인더가 더 어둡게 느껴진다.
  band: {
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  bandPlaceholder: { height: 92, backgroundColor: colors.ink },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  round: { color: "#fff", fontSize: 15, fontWeight: "800" },
  date: { color: colors.goldBright, fontSize: 12, fontWeight: "600" },
  ballsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  plusSign: { color: "#fff", fontSize: 14, fontWeight: "700" },
  errorText: { color: "#fff", fontSize: 12, textAlign: "center", paddingVertical: spacing.sm },
});
