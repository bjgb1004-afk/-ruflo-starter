import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { sectorIndexOf, sectorRanges, type ScoredNumber } from "@/features/backtest/recipes";
import {
  CANDIDATE_MAX,
  CANDIDATE_MIN,
  GROUP_WEIGHT_KEYS,
  LAB_WEIGHT_KEYS,
  MAX_WEIGHT,
  WEIGHT_LABELS,
  type AnalysisSetup,
  type LabWeightKey,
} from "../analysisSetup";

// 끌어서 움직이는 슬라이더에는 네이티브 부품이 필요하고, 그걸 넣으면 새 빌드 +
// runtimeVersion 교체 + 구버전 고립 위험이 따라온다. 이 기능은 OTA로 끝나야 하므로
// 누르는 칩으로 받는다. 0~5 여섯 단계면 슬라이더와 같은 일을 한다.
function WeightRow({
  weightKey,
  value,
  onChange,
}: {
  weightKey: LabWeightKey;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.weightRow}>
      <Text style={styles.weightLabel}>{WEIGHT_LABELS[weightKey]}</Text>
      <View style={styles.steps}>
        {Array.from({ length: MAX_WEIGHT + 1 }, (_, v) => (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            style={[styles.step, value === v && styles.stepActive]}
            accessibilityRole="button"
            accessibilityLabel={`${WEIGHT_LABELS[weightKey]} ${v}`}
          >
            <Text style={[styles.stepText, value === v && styles.stepTextActive]}>{v}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface Props {
  setup: AnalysisSetup;
  onChange: (next: AnalysisSetup) => void;
  /** 점수순으로 정렬된 전체 번호. */
  scored: ScoredNumber[];
  /** 최종 후보 번호(고정·제외·상한까지 적용된 것). */
  candidates: number[];
  maxNumber: number;
}

export function CandidatePanel({ setup, onChange, scored, candidates, maxNumber }: Props) {
  const useGroup = setup.groupCount !== undefined;
  const visibleKeys = LAB_WEIGHT_KEYS.filter((k) => useGroup || !GROUP_WEIGHT_KEYS.includes(k));
  const candidateSet = new Set(candidates);
  const sectors = sectorRanges(maxNumber);
  const perSector = sectors.map((_, i) => candidates.filter((n) => sectorIndexOf(n, maxNumber) === i).length);

  const without = (list: number[], n: number) => list.filter((x) => x !== n);
  const withNumber = (list: number[], n: number) => [...list, n].sort((a, b) => a - b);

  // 한 번 누르면 고정, 두 번이면 제외, 세 번이면 원래대로. 눌러서 세 상태를 돌린다.
  const cycle = (n: number) => {
    if (setup.pinned.includes(n)) {
      onChange({ ...setup, pinned: without(setup.pinned, n), excluded: withNumber(setup.excluded, n) });
    } else if (setup.excluded.includes(n)) {
      onChange({ ...setup, excluded: without(setup.excluded, n) });
    } else {
      onChange({ ...setup, pinned: withNumber(setup.pinned, n) });
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>무엇을 얼마나 볼지</Text>
        <Text style={styles.hint}>0은 안 보는 것, 5가 가장 크게 보는 것이에요.</Text>
        {visibleKeys.map((key) => (
          <WeightRow
            key={key}
            weightKey={key}
            value={setup.weights[key]}
            onChange={(v) => onChange({ ...setup, weights: { ...setup.weights, [key]: v } })}
          />
        ))}

        <Pressable
          onPress={() => onChange({ ...setup, groupCount: useGroup ? undefined : 10 })}
          style={[styles.toggle, useGroup && styles.toggleOn]}
          accessibilityRole="button"
        >
          <Text style={[styles.toggleText, useGroup && styles.toggleTextOn]}>
            회차주기 그룹 {useGroup ? `쓰는 중 (${setup.groupCount}개로 나눔)` : "쓰지 않음"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>후보 수</Text>
        <View style={styles.steps}>
          {Array.from({ length: CANDIDATE_MAX - CANDIDATE_MIN + 1 }, (_, i) => CANDIDATE_MIN + i).map((n) => (
            <Pressable
              key={n}
              onPress={() => onChange({ ...setup, candidateCount: n })}
              style={[styles.step, setup.candidateCount === n && styles.stepActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.stepText, setup.candidateCount === n && styles.stepTextActive]}>{n}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          구간별 후보 수 — {sectors.map(([lo, hi], i) => `${lo}~${hi}: ${perSector[i]}`).join(" · ")}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>후보 (점수순)</Text>
        <Text style={styles.hint}>한 번 누르면 꼭 넣기, 두 번 누르면 꼭 빼기, 세 번 누르면 원래대로예요.</Text>
        <View style={styles.grid}>
          {scored.map((s) => {
            const pinned = setup.pinned.includes(s.number);
            const excluded = setup.excluded.includes(s.number);
            const inCandidates = candidateSet.has(s.number);
            return (
              <Pressable
                key={s.number}
                onPress={() => cycle(s.number)}
                style={[
                  styles.cell,
                  inCandidates && styles.cellIn,
                  pinned && styles.cellPinned,
                  excluded && styles.cellExcluded,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${s.number}번 ${
                  pinned ? "꼭 넣기" : excluded ? "꼭 빼기" : inCandidates ? "후보" : "후보 아님"
                }`}
              >
                <Text style={[styles.cellNumber, excluded && styles.cellNumberOff]}>{s.number}</Text>
                <Text style={styles.cellScore}>{pinned ? "고정" : excluded ? "제외" : s.score.toFixed(2)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  weightRow: { gap: 4 },
  weightLabel: { fontSize: 13, color: colors.textPrimary },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  step: {
    minWidth: 34,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  stepActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  stepText: { fontSize: 13, color: colors.textSecondary },
  stepTextActive: { color: colors.primaryDark, fontWeight: "700" },
  toggle: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleOn: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  toggleText: { fontSize: 13, color: colors.textSecondary },
  toggleTextOn: { color: colors.primaryDark, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  cell: {
    width: 46,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cellIn: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  cellPinned: { backgroundColor: colors.goldLight, borderColor: colors.seal, borderWidth: 2 },
  cellExcluded: { backgroundColor: colors.background, borderColor: colors.border, opacity: 0.5 },
  cellNumber: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  cellNumberOff: { color: colors.textMuted },
  cellScore: { fontSize: 9, color: colors.textSecondary },
});
