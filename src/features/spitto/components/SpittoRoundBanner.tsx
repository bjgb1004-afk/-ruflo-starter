import { memo, useCallback } from "react";
import { Text, Pressable, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { getSellingSpittoRounds, remainingRatio } from "@/features/spitto/api/spittoApi";
import { colors, spacing, radius } from "@/constants/theme";

// 홈 첫 화면에 스피또 1등 잔여를 한 줄로 띄운다.
//
// 왜 홈인가: 이 숫자가 스레드 글감이고, 글을 보고 설치한 사람이 첫 화면에서 바로 그 숫자를
// 봐야 한다. 상세 화면은 더보기 안 두 뎁스에 있어서, 유입된 사람이 메뉴를 찾아 들어가지
// 않으면 평생 못 본다.
//
// 문구는 "손해를 막는 쪽"으로 쓴다(구매 유도 금지). 즉석복권은 온라인 판매가 안 되므로
// 이 앱이 할 수 있는 건 "1등이 다 나간 회차를 피하게 해주는 것"까지다.

/** "11매 모두 남음" / "12매 중 8매 남음". 전부 남은 회차는 그 사실 자체가 눈에 띄는 정보다. */
function describeRank1(remaining: number, total: number): string {
  return remaining === total ? `1등 ${total}매 모두 남음` : `1등 ${total}매 중 ${remaining}매 남음`;
}

export const SpittoRoundBanner = memo(function SpittoRoundBanner() {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["spitto", "selling-rounds"],
    queryFn: getSellingSpittoRounds,
    // 원본(동행복권)이 금요일 기준 주 1회만 갱신된다. 자주 다시 받아올 이유가 없다.
    staleTime: 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
  });

  const handlePress = useCallback(() => router.push("/more/spitto"), [router]);

  const top = data?.[0];
  // 아직 한 번도 수집이 안 됐거나, 1등 잔여를 모르는 회차만 있으면 띄우지 않는다.
  // getSellingSpittoRounds가 모르는 회차를 맨 뒤로 보내므로, 첫 번째가 모르면 전부 모른다.
  if (!top || remainingRatio(top) < 0) return null;

  return (
    <Pressable style={styles.banner} onPress={handlePress}>
      <Text style={styles.text}>
        🎟️ {top.game_name} {top.round_no}회 ·{" "}
        {describeRank1(top.rank1_remaining as number, top.rank1_total as number)}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // 바로 위 NewWinnerBanner가 금색 띠다. 같은 색을 쓰면 두 줄이 한 덩어리로 뭉개지고,
  // 더 중요한 소식(1등 배출)의 강조가 죽는다. 흰 카드 + 테두리로 한 단계 낮춰 둔다.
  banner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  text: { fontSize: 13, color: colors.textPrimary, fontWeight: "600" },
});
