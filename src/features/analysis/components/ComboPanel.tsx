import { Pressable, StyleSheet, Text, View } from "react-native";
import { LottoBall } from "@/components/LottoBall";
import { colors, radius, spacing } from "@/constants/theme";
import type { FilterConfig } from "@/features/backtest/types";
import type { ComboPick } from "../comboPicker";
import type { AnalysisSetup } from "../analysisSetup";

// 필터는 숫자 입력창이 아니라 흔히 쓰는 값 칩으로 받는다. 키보드가 화면 절반을 덮고,
// 합계 21~22처럼 통과 조합이 0개인 값을 받기도 너무 쉽다.
const SUM_RANGES: readonly { label: string; value: [number, number] | undefined }[] = [
  { label: "제한 없음", value: undefined },
  { label: "100~175", value: [100, 175] },
  { label: "109~167", value: [109, 167] },
  { label: "120~160", value: [120, 160] },
];

const RATIO_SETS: readonly { label: string; value: [number, number][] | undefined }[] = [
  { label: "제한 없음", value: undefined },
  {
    label: "2:4 ~ 4:2",
    value: [
      [2, 4],
      [3, 3],
      [4, 2],
    ],
  },
  { label: "3:3만", value: [[3, 3]] },
];

const CONSECUTIVE: readonly { label: string; value: number | undefined }[] = [
  { label: "제한 없음", value: undefined },
  { label: "연속 없음", value: 1 },
  { label: "2연속까지", value: 2 },
];

const SAME_ENDING: readonly { label: string; value: number | undefined }[] = [
  { label: "제한 없음", value: undefined },
  { label: "겹침 없음", value: 1 },
  { label: "2개까지", value: 2 },
];

const CARRY_OVER: readonly { label: string; value: [number, number] | undefined }[] = [
  { label: "제한 없음", value: undefined },
  { label: "0개", value: [0, 0] },
  { label: "1개 이하", value: [0, 1] },
  { label: "1개 이상", value: [1, 6] },
];

const GAME_COUNTS = [1, 5, 10, 20] as const;

function ChipRow<T>({
  title,
  options,
  selected,
  onPick,
}: {
  title: string;
  options: readonly { label: string; value: T }[];
  selected: (v: T) => boolean;
  onPick: (v: T) => void;
}) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{title}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Pressable
            key={o.label}
            onPress={() => onPick(o.value)}
            style={[styles.chip, selected(o.value) && styles.chipActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, selected(o.value) && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const sameRange = (a?: [number, number], b?: [number, number]) =>
  a === undefined && b === undefined ? true : !!a && !!b && a[0] === b[0] && a[1] === b[1];

const sameRatios = (a?: [number, number][], b?: [number, number][]) =>
  a === undefined && b === undefined
    ? true
    : !!a && !!b && a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

interface Props {
  setup: AnalysisSetup;
  onChange: (next: AnalysisSetup) => void;
  pick: ComboPick;
  gameCount: number;
  onGameCountChange: (n: number) => void;
  onSave: () => void;
  onShare: () => void;
  saving: boolean;
}

export function ComboPanel({
  setup,
  onChange,
  pick,
  gameCount,
  onGameCountChange,
  onSave,
  onShare,
  saving,
}: Props) {
  const setFilters = (patch: Partial<FilterConfig>) =>
    onChange({ ...setup, filters: { ...setup.filters, ...patch } });

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>조합 조건</Text>

        <ChipRow
          title="합계"
          options={SUM_RANGES}
          selected={(v) => sameRange(v, setup.filters.sumRange)}
          onPick={(v) => setFilters({ sumRange: v })}
        />
        <ChipRow
          title="홀짝"
          options={RATIO_SETS}
          selected={(v) => sameRatios(v, setup.filters.oddEven)}
          onPick={(v) => setFilters({ oddEven: v })}
        />
        <ChipRow
          title="저:고"
          options={RATIO_SETS}
          selected={(v) => sameRatios(v, setup.filters.lowHigh)}
          onPick={(v) => setFilters({ lowHigh: v })}
        />
        <ChipRow
          title="연속번호"
          options={CONSECUTIVE}
          selected={(v) => v === setup.filters.maxConsecutive}
          onPick={(v) => setFilters({ maxConsecutive: v })}
        />
        <ChipRow
          title="같은 끝수"
          options={SAME_ENDING}
          selected={(v) => v === setup.filters.maxSameEndingDigit}
          onPick={(v) => setFilters({ maxSameEndingDigit: v })}
        />
        <ChipRow
          title="직전 회차 겹침"
          options={CARRY_OVER}
          selected={(v) => sameRange(v, setup.filters.previousDrawOverlap)}
          onPick={(v) => setFilters({ previousDrawOverlap: v })}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.count}>
          후보로 만들 수 있는 조합 {pick.total.toLocaleString()}개 중{" "}
          <Text style={styles.countStrong}>{pick.passing.toLocaleString()}개</Text>가 조건을 통과했어요
        </Text>
        {pick.total === 0 && <Text style={styles.warn}>후보가 6개보다 적어요. 후보 칸에서 제외를 풀어주세요.</Text>}
        {pick.total > 0 && pick.passing === 0 && (
          <Text style={styles.warn}>조건이 좁아서 통과하는 조합이 없어요. 조건을 풀어보세요.</Text>
        )}

        <ChipRow
          title="만들 게임 수"
          options={GAME_COUNTS.map((n) => ({ label: `${n}게임`, value: n }))}
          selected={(v) => v === gameCount}
          onPick={onGameCountChange}
        />

        {pick.games.length > 0 && pick.games.length < gameCount && (
          <Text style={styles.warn}>
            조건을 통과한 조합이 {pick.passing}개라 {pick.games.length}게임만 만들었어요.
          </Text>
        )}

        <View style={styles.games}>
          {pick.games.map((game) => (
            <View key={game.join(",")} style={styles.game}>
              {game.map((n) => (
                <LottoBall key={n} number={n} size="small" />
              ))}
            </View>
          ))}
        </View>

        {pick.games.length > 0 && (
          <View style={styles.buttons}>
            <Pressable style={styles.button} onPress={onSave} disabled={saving} accessibilityRole="button">
              <Text style={styles.buttonText}>{saving ? "저장 중..." : "보관함에 저장"}</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={onShare} accessibilityRole="button">
              <Text style={styles.buttonText}>번호 보내기</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  filterRow: { gap: 4 },
  filterLabel: { fontSize: 13, color: colors.textPrimary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textSecondary },
  chipTextActive: { color: colors.primaryDark, fontWeight: "700" },
  count: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  countStrong: { color: colors.textPrimary, fontWeight: "700" },
  warn: { fontSize: 12, color: colors.danger, lineHeight: 18 },
  games: { gap: spacing.xs },
  game: { flexDirection: "row", gap: 4, alignItems: "center" },
  buttons: { flexDirection: "row", gap: spacing.sm },
  button: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
  },
  buttonText: { fontSize: 13, color: colors.primaryDark, fontWeight: "700" },
});
