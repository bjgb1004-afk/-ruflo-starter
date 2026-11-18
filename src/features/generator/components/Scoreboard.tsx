import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  getGeneratorStats,
  totalHits,
  type GeneratorTotals,
} from "../api/generatorStatsApi";
import { sourceLabel } from "../sourceLabel";
import { reportError } from "@/lib/errorLog";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";

// 생성기 화면과 관리자 화면이 같이 쓰는 카드라 라우트 파일(app/*)이 아니라 여기 둔다 -
// 라우트끼리 서로 import하면 expo-router가 화면을 등록하는 흐름과 얽힌다.
//
// 집계는 추첨 후 배치(aggregateGeneratedTickets.ts)가 만들고 이 화면은 읽기만 한다. 그래서
// "다음 회차가 집계되기 전까지 지난 결과를 그대로 유지"가 저절로 된다 - getGeneratorStats가
// 마지막으로 집계된 회차를 돌려줄 뿐이기 때문이다.

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

const RANKS = [1, 2, 3, 4, 5] as const;

function rankCountOf(t: GeneratorTotals, rank: (typeof RANKS)[number]): number {
  return rank === 1 ? t.rank1 : rank === 2 ? t.rank2 : rank === 3 ? t.rank3 : rank === 4 ? t.rank4 : t.rank5;
}

export function Scoreboard() {
  // 코너별 내역만 접는다. 숨기는 게 아니라 "몇 개 있는지"를 버튼에 적어두고 한 번에 다
  // 펼친다 - 예전처럼 5개만 보여주고 나머지를 뭉개면 뭐가 빠졌는지 알 수가 없다.
  // 당첨금 밑의 안내 문구는 접지 않는다: 유리한 숫자만 보이고 그걸 깎는 설명이 탭 뒤로
  // 숨으면 정직하지 않다.
  const [expanded, setExpanded] = useState(false);
  const { data, error } = useQuery({
    queryKey: ["generator", "stats"],
    queryFn: getGeneratorStats,
    staleTime: 10 * 60 * 1000,
  });
  // 이 카드는 받을 게 없으면 조용히 사라진다. 그 자체는 맞는 동작이지만(집계 전엔 보여줄
  // 게 없다), 조회가 실패해서 사라진 경우와 구분이 안 된다 - 2026-11-07에 "1249회 성적표가
  // 안 보인다"는 신고를 받고도 서버는 멀쩡해서 확인할 길이 없었다. 실패는 남겨둔다.
  useEffect(() => {
    if (error) reportError(error, "generator-stats");
  }, [error]);
  if (!data || data.drawNo == null) return null;

  const hits = totalHits(data.round);
  const rows = data.bySource.filter((s) => s.games > 0).sort((a, b) => b.games - a.games);

  return (
    <View style={styles.scoreCard}>
      <Text style={styles.scoreTitle}>{data.drawNo}회 앱 성적표</Text>
      <Text style={styles.subtitle}>
        앱에서 나간 번호 {data.round.games.toLocaleString("ko-KR")}게임 · 당첨 {hits.toLocaleString("ko-KR")}건
      </Text>

      <View style={styles.rankRow}>
        {RANKS.map((rank) => (
          <View key={rank} style={styles.rankCell}>
            <Text style={styles.rankLabel}>{rank}등</Text>
            <Text style={[styles.rankValue, rankCountOf(data.round, rank) > 0 && styles.rankValueHit]}>
              {rankCountOf(data.round, rank).toLocaleString("ko-KR")}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.moneyRow}>
        <Text style={styles.moneyLabel}>이번 회차 당첨금</Text>
        <Text style={styles.moneyValue}>{won(data.round.prizeTotal)}</Text>
      </View>
      <View style={styles.moneyRow}>
        <Text style={styles.moneyLabel}>
          누적 당첨금
          {data.cumulative.fromDrawNo != null ? ` (${data.cumulative.fromDrawNo}회부터 ${data.cumulative.rounds}회차)` : ""}
        </Text>
        <Text style={styles.moneyValue}>{won(data.cumulative.prizeTotal)}</Text>
      </View>

      {rows.length > 0 && (
        <Pressable
          style={styles.toggleButton}
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={styles.toggleButtonText}>코너별 성적 ({rows.length}개)</Text>
          <Text style={styles.toggleChevron}>{expanded ? "▲" : "▼"}</Text>
        </Pressable>
      )}

      {expanded &&
        rows.map((row) => (
        <View key={row.source} style={styles.sourceRow}>
          <Text style={styles.sourceName} numberOfLines={1}>
            {sourceLabel(row.source)}
          </Text>
          <Text style={styles.sourceValue}>
            {row.games.toLocaleString("ko-KR")}게임 · 당첨 {totalHits(row).toLocaleString("ko-KR")}건 ·{" "}
            {won(row.prizeTotal)}
          </Text>
        </View>
        ))}

      {data.round.prizeUnknown > 0 && (
        <Text style={styles.disclaimer}>
          이 중 {data.round.prizeUnknown}건은 1~3등 1인 당첨금이 아직 공개되지 않아 합계에서 빠졌어요. 0원을 받았다는
          뜻이 아니에요.
        </Text>
      )}
      <Text style={styles.disclaimer}>
        앱에서 나온 번호를 전부 세요. 실제로 샀는지는 앱이 알 수 없어서, 사지 않았다면 받을 수 없는 금액이에요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scoreCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  scoreTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  rankRow: { flexDirection: "row", gap: spacing.xs },
  rankCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  rankLabel: { fontSize: 12, color: colors.textSecondary },
  rankValue: { fontSize: 16, fontWeight: "700", color: colors.textMuted },
  rankValueHit: { color: colors.seal },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  moneyLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  moneyValue: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  toggleButtonText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  toggleChevron: { fontSize: 12, color: colors.textMuted },
  sourceRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  sourceName: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  sourceValue: { fontSize: 12, color: colors.textSecondary },
  disclaimer: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
