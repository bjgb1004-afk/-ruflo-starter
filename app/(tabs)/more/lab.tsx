import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { colors, radius, spacing } from "@/constants/theme";
import { getDrawsForBacktest } from "@/features/backtest/api/backtestDrawsApi";
import { seededRng } from "@/features/backtest/engine";
import {
  computeNumberStats,
  modGroupOf,
  scoreNumbers,
  sectorIndexOf,
  topCandidates,
  topCandidatesCapped,
} from "@/features/backtest/recipes";
import { KOREA_LOTTO_6_45 } from "@/features/backtest/types";
import { upcomingDrawNo } from "@/features/generator/geniusGenerator";
import { LAB_SOURCE, recordGeneratedTickets } from "@/features/generator/recordGeneratedTickets";
import { useMyLottoTickets } from "@/features/mylotto/useMyLottoTickets";
import {
  ALL_ROUNDS,
  SPAN_OPTIONS,
  defaultSetup,
  toRecipeWeights,
  windowOf,
  type AnalysisSetup,
} from "@/features/analysis/analysisSetup";
import { pickCombos } from "@/features/analysis/comboPicker";
import { gapStats, pairCounts, shapeDistribution, topPartners } from "@/features/analysis/historyStats";
import { CandidatePanel } from "@/features/analysis/components/CandidatePanel";
import { ComboPanel } from "@/features/analysis/components/ComboPanel";
import { DistributionPanel } from "@/features/analysis/components/DistributionPanel";
import { NumberHeatGrid, type HeatMetric } from "@/features/analysis/components/NumberHeatGrid";
import { useAnalysisSetups } from "@/features/analysis/useAnalysisSetups";

const RULE = KOREA_LOTTO_6_45;

const TABS = [
  { key: "stats", label: "통계" },
  { key: "candidates", label: "후보" },
  { key: "combos", label: "조합" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function LabScreen() {
  const insets = useSafeAreaInsets();
  const { data: draws, isLoading, error } = useQuery({
    queryKey: ["backtest", "draws"],
    queryFn: getDrawsForBacktest,
    staleTime: 60 * 60 * 1000,
  });

  const [tab, setTab] = useState<TabKey>("stats");
  const [metric, setMetric] = useState<HeatMetric>("count");
  const [setup, setSetup] = useState<AnalysisSetup>(defaultSetup);
  const [gameCount, setGameCount] = useState(5);
  const [saving, setSaving] = useState(false);

  const saveSetup = useAnalysisSetups((s) => s.save);
  const drawNo = useMemo(() => upcomingDrawNo(), []);
  const addTickets = useMyLottoTickets((s) => s.addTickets);

  // 선택 구간. 출현 횟수·동반 출현·조합 특성 분포에만 쓴다.
  const window = useMemo(() => (draws ? windowOf(draws, setup.span) : []), [draws, setup.span]);
  const spanLabel = useMemo(
    () => SPAN_OPTIONS.find((o) => o.value === setup.span)?.label ?? "전체",
    [setup.span],
  );

  const counts = useMemo(() => {
    const out = new Array<number>(RULE.maxNumber + 1).fill(0);
    for (const d of window) for (const n of d.numbers) out[n] += 1;
    return out;
  }, [window]);

  // 미출현 기간과 출현 간격은 전체 회차 기준이다. 구간을 자르면 "11회 전에 나온 번호"가
  // "10회 미출현"으로 보여 거짓이 된다.
  const gaps = useMemo(() => (draws ? gapStats(draws, RULE) : []), [draws]);
  const pairs = useMemo(() => pairCounts(window, RULE), [window]);
  const dist = useMemo(() => shapeDistribution(window, RULE), [window]);
  const partnersOf = useCallback((n: number) => topPartners(pairs, n, 5), [pairs]);

  // 점수: 전체 회차를 넣고 "최근"의 길이만 선택 구간으로 준다 - totalFrequency는 전체,
  // recentFrequency·구간 균형은 선택 구간이 되어 둘을 가중치로 섞을 수 있다.
  const scored = useMemo(() => {
    if (!draws || draws.length === 0) return [];
    const recentWindow = setup.span === ALL_ROUNDS ? draws.length : setup.span;
    const grouping =
      setup.groupCount !== undefined
        ? { kind: "round-cycle" as const, groupCount: setup.groupCount }
        : undefined;
    const targetGroup = grouping
      ? ((drawNo % grouping.groupCount) + grouping.groupCount) % grouping.groupCount
      : undefined;
    const stats = computeNumberStats(draws, RULE, recentWindow, grouping, targetGroup);
    return scoreNumbers(stats, toRecipeWeights(setup)).sort((a, b) => b.score - a.score || a.number - b.number);
  }, [draws, setup, drawNo]);

  const candidates = useMemo(() => {
    const allowed = scored.filter((s) => !setup.excluded.includes(s.number));
    const room = Math.max(0, setup.candidateCount - setup.pinned.length);
    const auto =
      setup.sectorCap !== undefined
        ? topCandidatesCapped(allowed, room, setup.sectorCap, (n) => sectorIndexOf(n, RULE.maxNumber))
        : setup.modGroupCap !== undefined
          ? topCandidatesCapped(allowed, room, setup.modGroupCap, modGroupOf)
          : topCandidates(allowed, room);
    return [...new Set([...setup.pinned, ...auto.map((c) => c.number)])].sort((a, b) => a - b);
  }, [scored, setup]);

  const pick = useMemo(
    () =>
      pickCombos({
        candidates,
        pinned: setup.pinned,
        rule: RULE,
        filters: setup.filters,
        count: gameCount,
        rng: seededRng(`lab|${drawNo}|${JSON.stringify(setup)}|${gameCount}`),
        previousDraw: draws?.[draws.length - 1],
      }),
    [candidates, setup, gameCount, drawNo, draws],
  );

  // 화면에 뜬 번호를 익명으로 집계한다(기존 생성기와 같은 규칙). 설정을 만지면 조합이 계속
  // 바뀌므로, 이미 보낸 조합은 기억해 두고 새로 나온 것만 보낸다.
  const sentRef = useRef(new Set<string>());
  useEffect(() => {
    const fresh = pick.games.filter((g) => !sentRef.current.has(g.join(",")));
    if (fresh.length === 0) return;
    for (const g of fresh) sentRef.current.add(g.join(","));
    recordGeneratedTickets(LAB_SOURCE, drawNo, fresh);
  }, [pick.games, drawNo]);

  const save = useCallback(() => {
    if (pick.games.length === 0) return;
    setSaving(true);
    const added = addTickets(
      pick.games.map((numbers) => ({ drawNo, numbers, purchaseType: null, purchased: false })),
    );
    setSaving(false);
    Alert.alert(
      "보관함에 저장했어요",
      added.length === pick.games.length
        ? `${added.length}게임을 ${drawNo}회로 저장했어요.`
        : `${added.length}게임을 저장했어요. 이미 저장된 조합은 건너뛰었어요.`,
    );
  }, [pick.games, addTickets, drawNo]);

  const share = useCallback(() => {
    if (pick.games.length === 0) return;
    const body = pick.games.map((g, i) => `${i + 1}. ${g.join(" ")}`).join("\n");
    void Share.share({ message: `${drawNo}회 내 분석 번호\n${body}` });
  }, [pick.games, drawNo]);

  const store = useCallback(() => {
    const name = `${spanLabel} · 후보 ${setup.candidateCount}개`;
    saveSetup({ ...setup, id: `${Date.now()}`, name, savedAt: new Date().toISOString() });
    Alert.alert("설정을 저장했어요", `"${name}"으로 폰에 저장했어요.`);
  }, [saveSetup, setup, spanLabel]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.centerText}>회차를 불러오는 중이에요</Text>
      </View>
    );
  }

  if (error || !draws || draws.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>회차를 불러오지 못했어요. 잠시 뒤에 다시 열어주세요.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={styles.chips}>
        {SPAN_OPTIONS.map((o) => (
          <Pressable
            key={o.label}
            onPress={() => setSetup((s) => ({ ...s, span: o.value }))}
            style={[styles.chip, setup.span === o.value && styles.chipActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, setup.span === o.value && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.meta}>
        {draws[0].round}~{draws[draws.length - 1].round}회 중 {window.length}회차를 보고 있어요
      </Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "stats" && (
        <View style={styles.panel}>
          <NumberHeatGrid
            metric={metric}
            onMetricChange={setMetric}
            counts={counts}
            gaps={gaps}
            partnersOf={partnersOf}
            spanLabel={spanLabel}
            maxNumber={RULE.maxNumber}
          />
          <DistributionPanel dist={dist} pickCount={RULE.pickCount} />
        </View>
      )}

      {tab === "candidates" && (
        <CandidatePanel
          setup={setup}
          onChange={setSetup}
          scored={scored}
          candidates={candidates}
          maxNumber={RULE.maxNumber}
        />
      )}

      {tab === "combos" && (
        <ComboPanel
          setup={setup}
          onChange={setSetup}
          pick={pick}
          gameCount={gameCount}
          onGameCountChange={setGameCount}
          onSave={save}
          onShare={share}
          saving={saving}
        />
      )}

      <Pressable style={styles.storeButton} onPress={store} accessibilityRole="button">
        <Text style={styles.storeButtonText}>이 설정 저장</Text>
      </Pressable>

      <Text style={styles.disclaimer}>통계 참고용이며 당첨 확률을 높여주지 않습니다.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  centerText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textSecondary },
  chipTextActive: { color: colors.primaryDark, fontWeight: "700" },
  meta: { fontSize: 11, color: colors.textMuted },
  tabs: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, color: colors.textSecondary, fontWeight: "700" },
  tabTextActive: { color: "#fff" },
  panel: { gap: spacing.md },
  storeButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  storeButtonText: { fontSize: 13, color: colors.textSecondary, fontWeight: "700" },
  disclaimer: { fontSize: 11, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm },
});
