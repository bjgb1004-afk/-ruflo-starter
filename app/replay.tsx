import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { NumberPicker } from "@/components/NumberPicker";
import { LottoBall } from "@/components/LottoBall";
import { getDrawsForBacktest } from "@/features/backtest/api/backtestDrawsApi";
import { replay, hitDescription, RANK_LABEL, type ReplayHit, type ReplayResult } from "@/features/backtest/replay";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

const PICK_COUNT = 6;

// 되짚을 구간. 구간을 넓힐수록 당첨 횟수가 눈에 띄게 늘어 "번호가 아니라 회차 수"라는 게
// 말이 아니라 숫자로 보인다(실측 100회 2.5번 / 300회 7.2번 / 전체 23.1번).
const SPANS: readonly { label: string; rounds: number }[] = [
  { label: "최근 100회", rounds: 100 },
  { label: "최근 300회", rounds: 300 },
  { label: "전체", rounds: Number.POSITIVE_INFINITY },
];

// 등수에 든 회차가 많으면 전부 그리지 않는다. 전 회차를 돌리면 5등만 30번 가까이 나온다.
const HIT_LIST_LIMIT = 20;

function fillRest(chosen: readonly number[]): number[] {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !chosen.includes(n));
  const picked = [...chosen];
  while (picked.length < PICK_COUNT) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked.sort((a, b) => a - b);
}

export default function ReplayScreen() {
  // 제스처바가 있는 기기에서는 마지막 줄이 그 뒤로 들어가 안 읽힌다.
  const insets = useSafeAreaInsets();
  const { data: draws, isLoading, error } = useQuery({
    queryKey: ["backtest", "draws"],
    queryFn: getDrawsForBacktest,
    staleTime: 60 * 60 * 1000,
  });

  const [selected, setSelected] = useState<number[]>([]);
  // 전체로 시작한다. 실측(982회 기준) 평균 23번 당첨에 최소도 12번이라 누가 열어도 결과가
  // 비어 있지 않다. 100회로 좁히면 200세트 중 13세트가 한 번도 등수에 못 든다.
  const [spanIndex, setSpanIndex] = useState(SPANS.length - 1);
  const [result, setResult] = useState<ReplayResult | null>(null);

  const complete = selected.length === PICK_COUNT;

  const start = useCallback(() => {
    if (!draws || !complete) return;
    const { rounds } = SPANS[spanIndex];
    const slice = Number.isFinite(rounds) ? draws.slice(Math.max(0, draws.length - rounds)) : draws;
    setResult(replay(selected, slice));
  }, [draws, complete, selected, spanIndex]);

  // 번호나 구간을 바꾸면 지난 결과는 더 이상 그 번호의 것이 아니다.
  const pick = useCallback((next: number[]) => {
    setSelected(next);
    setResult(null);
  }, []);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>지난 회차를 불러오는 중이에요</Text>
      </View>
    );
  }

  if (error || !draws) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>회차를 불러오지 못했어요. 잠시 뒤 다시 열어주세요.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>내 번호로 과거를 돌려보기</Text>
        <Text style={styles.subtitle}>
          번호 6개를 고르면 그 번호로 지난 회차를 전부 사본 셈 치고 몇 등까지 갔는지 보여드려요.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.chosenRow}>
          {Array.from({ length: PICK_COUNT }, (_, i) =>
            selected[i] ? (
              <LottoBall key={selected[i]} number={selected[i]} size="small" />
            ) : (
              <View key={`empty-${i}`} style={styles.emptyBall} />
            ),
          )}
        </View>
        <Text style={styles.count}>
          {selected.length} / {PICK_COUNT}
        </Text>
      </View>

      <View style={styles.card}>
        <NumberPicker selected={selected} onChange={pick} max={PICK_COUNT} />
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.secondaryButton, complete && styles.buttonDisabled]}
          onPress={() => pick(fillRest(selected))}
          disabled={complete}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>나머지 자동</Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryButton, selected.length === 0 && styles.buttonDisabled]}
          onPress={() => pick([])}
          disabled={selected.length === 0}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>지우기</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>얼마나 거슬러 갈까요</Text>
        <View style={styles.chips}>
          {SPANS.map((s, i) => {
            const active = i === spanIndex;
            return (
              <Pressable
                key={s.label}
                onPress={() => {
                  setSpanIndex(i);
                  setResult(null);
                }}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        style={[styles.primaryButton, !complete && styles.buttonDisabled]}
        onPress={start}
        disabled={!complete}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>돌려보기</Text>
      </Pressable>

      {result && <Results result={result} ticket={selected} />}

      <Text style={styles.disclaimer}>
        실제로 있었던 회차 결과로 맞춰본 거예요. 번호를 바꿔도 결과는 비슷하게 나와요 - 당첨 횟수를 늘리는 건 번호가
        아니라 회차 수예요. 로또는 회차마다 독립이라 지난 기록이 다음 회차를 바꾸지는 못해요.
      </Text>
    </ScrollView>
  );
}

function Results({ result, ticket }: { result: ReplayResult; ticket: readonly number[] }) {
  const { best, hits, rankCounts, roundsPlayed, from, to } = result;
  const total = hits.length;

  const ranks = useMemo(
    () => ([1, 2, 3, 4, 5] as const).filter((r) => rankCounts[r] > 0),
    [rankCounts],
  );

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>최고 기록</Text>
        {best ? (
          <>
            <View style={styles.bestRow}>
              <Text style={styles.bestRank}>{RANK_LABEL[best.rank]}</Text>
              <Text style={styles.bestDetail}>
                {best.round}회 · {hitDescription(best)}
              </Text>
            </View>
            {best.drawDate && <Text style={styles.note}>{best.drawDate} 추첨</Text>}
            <HitBalls hit={best} ticket={ticket} />
          </>
        ) : (
          <Text style={styles.muted}>
            이 구간에서는 3개 이상 맞은 회차가 없었어요. 구간을 늘리면 거의 나옵니다.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>
          {from}~{to}회 · {roundsPlayed.toLocaleString()}회 돌려본 결과
        </Text>
        <View style={styles.totalRow}>
          <Text style={styles.total}>{total.toLocaleString()}</Text>
          <Text style={styles.totalUnit}>번 당첨</Text>
        </View>
        {ranks.map((r) => (
          <View key={r} style={styles.row}>
            <Text style={styles.rowLabel}>{RANK_LABEL[r]}</Text>
            <Text style={styles.rowValue}>{rankCounts[r].toLocaleString()}번</Text>
          </View>
        ))}
        {total === 0 && <Text style={styles.muted}>당첨된 회차가 없었어요.</Text>}
      </View>

      {hits.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>당첨된 회차</Text>
          {hits.slice(0, HIT_LIST_LIMIT).map((hit) => (
            <View key={hit.round} style={styles.hitItem}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>
                  {hit.round}회 {hit.drawDate ? `· ${hit.drawDate}` : ""}
                </Text>
                <Text style={styles.rowValue}>
                  {RANK_LABEL[hit.rank]} · {hitDescription(hit)}
                </Text>
              </View>
              <HitBalls hit={hit} ticket={ticket} />
            </View>
          ))}
          {hits.length > HIT_LIST_LIMIT && (
            <Text style={styles.note}>
              성적 좋은 {HIT_LIST_LIMIT}회차만 보여드려요. 나머지 {hits.length - HIT_LIST_LIMIT}번도 당첨이에요.
            </Text>
          )}
        </View>
      )}
    </>
  );
}

/** 그 회차 당첨번호. 내 번호와 겹친 공만 진하게 둔다. */
function HitBalls({ hit, ticket }: { hit: ReplayHit; ticket: readonly number[] }) {
  return (
    <View style={styles.balls}>
      {hit.winningNumbers.map((n) => (
        <View key={n} style={ticket.includes(n) ? undefined : styles.ballMissed}>
          <LottoBall number={n} size="small" />
        </View>
      ))}
      {hit.bonusMatched && hit.bonus !== undefined && (
        <>
          <Text style={styles.plus}>+</Text>
          <LottoBall number={hit.bonus} size="small" isBonus />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  header: { gap: spacing.xs },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...cardShadow,
  },
  cardLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  chosenRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  emptyBall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  count: { textAlign: "center", fontSize: 13, color: colors.textSecondary },
  chips: { flexDirection: "row", gap: spacing.sm },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  chipTextActive: { color: "#FFFFFF" },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  buttonDisabled: { opacity: 0.4 },
  bestRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  bestRank: { fontSize: 30, fontWeight: "700", color: colors.primary, ...numericFont },
  bestDetail: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, ...numericFont },
  totalRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  total: { fontSize: 30, fontWeight: "700", color: colors.textPrimary, ...numericFont },
  totalUnit: { fontSize: 14, color: colors.textSecondary, paddingBottom: 5 },
  balls: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs },
  ballMissed: { opacity: 0.25 },
  plus: { fontSize: 13, color: colors.textSecondary, paddingHorizontal: 2 },
  hitItem: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontSize: 13, color: colors.textSecondary },
  rowValue: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, ...numericFont },
  note: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  muted: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  disclaimer: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
});
