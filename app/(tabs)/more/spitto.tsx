import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSellingSpittoRounds, type SpittoRound } from "@/features/spitto/api/spittoApi";
import { describeStock, shouldSuggestCall } from "@/features/spitto/describeStock";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const [, month, day] = iso.split("-");
  return month && day ? `${Number(month)}월 ${Number(day)}일` : null;
}

function RoundCard({ round }: { round: SpittoRound }) {
  const router = useRouter();
  const { rank1_remaining: left, rank1_total: total, stock_rate: stock } = round;
  const allLeft = left !== null && total !== null && left === total && total > 0;
  const noneLeft = left === 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>
          {round.game_name} <Text style={styles.cardRound}>{round.round_no}회</Text>
        </Text>
        {round.rank1_prize && <Text style={styles.prize}>1등 {round.rank1_prize}</Text>}
      </View>

      {allLeft && <Text style={styles.highlight}>⭐ 1등이 {total}장 전부 남아있어요</Text>}
      {noneLeft && <Text style={styles.warn}>1등은 이미 다 나갔어요</Text>}

      <View style={styles.rankRow}>
        <Text style={styles.rankLabel}>1등</Text>
        <Text style={styles.rankValue}>
          {left === null || total === null ? (
            "정보 없음"
          ) : (
            <>
              <Text style={styles.rankNumber}>{total}</Text>장 중{" "}
              <Text style={styles.rankNumber}>{left}</Text>장 남음
            </>
          )}
        </Text>
      </View>
      {round.rank2_remaining !== null && round.rank2_total !== null && (
        <View style={styles.rankRow}>
          <Text style={styles.rankLabel}>2등</Text>
          <Text style={styles.rankValue}>
            <Text style={styles.rankNumber}>{round.rank2_total}</Text>장 중{" "}
            <Text style={styles.rankNumber}>{round.rank2_remaining}</Text>장 남음
          </Text>
        </View>
      )}

      {stock !== null && (
        <View style={styles.stockBox}>
          <Text style={styles.stockText}>{describeStock(stock)}</Text>
          {shouldSuggestCall(stock) && (
            <Pressable style={styles.findButton} onPress={() => router.push("/")}>
              <Text style={styles.findButtonText}>
                🔎 가게 찾아 전화로 물어보기
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.footRow}>
        {round.price !== null && (
          <Text style={styles.footText}>{round.price.toLocaleString()}원</Text>
        )}
        {formatDate(round.sale_end_date) && (
          <Text style={styles.footText}>판매 마감 {formatDate(round.sale_end_date)}</Text>
        )}
      </View>
    </View>
  );
}

export default function SpittoScreen() {
  const insets = useSafeAreaInsets();
  const { data: rounds, isLoading, error } = useQuery({
    queryKey: ["spitto", "selling"],
    queryFn: getSellingSpittoRounds,
    // 입고율·잔여수량은 금요일 기준 주 1회 갱신이라 자주 다시 받아올 이유가 없다.
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });

  // 입고율·잔여수량이 "언제 기준"인지. 숫자만 보여주면 실시간으로 오해한다.
  const asOf = rounds?.find((r) => r.figures_as_of)?.figures_as_of ?? null;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
    >
      <Text style={styles.heading}>지금 살 수 있는 스피또</Text>
      <Text style={styles.subheading}>
        1등이 많이 남은 회차를 위에 보여드려요. 이미 1등이 다 나간 회차를 피할 수 있어요.
      </Text>

      {error || !rounds || rounds.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>
            아직 회차 정보를 받아오지 못했어요. 잠시 뒤에 다시 확인해주세요.
          </Text>
        </View>
      ) : (
        rounds.map((round) => (
          <RoundCard key={`${round.game_type}-${round.round_no}`} round={round} />
        ))
      )}

      {asOf && (
        <Text style={styles.footnote}>
          * 입고율과 잔여수량은 동행복권이 {formatDate(asOf)}에 발표한 값이에요. 매일 바뀌지
          않고 주 1회 갱신됩니다.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  subheading: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  card: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, flexShrink: 1 },
  cardRound: { fontSize: 15, fontWeight: "700", color: colors.textSecondary, fontFamily: numericFont.medium },
  prize: { fontSize: 13, fontWeight: "700", color: colors.gold, flexShrink: 0 },
  highlight: { fontSize: 14, fontWeight: "700", color: colors.primary, lineHeight: 20 },
  warn: { fontSize: 13, fontWeight: "600", color: colors.textMuted, lineHeight: 19 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rankLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    width: 32,
  },
  rankValue: { fontSize: 13, color: colors.textPrimary },
  rankNumber: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, fontFamily: numericFont.bold },
  stockBox: {
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  stockText: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  findButton: {
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  findButtonText: { fontSize: 13, fontWeight: "700", color: colors.primaryDark },
  footRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  footText: { fontSize: 12, color: colors.textMuted },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19 },
  footnote: { fontSize: 11, color: colors.textMuted, lineHeight: 16, marginTop: spacing.xs },
});
