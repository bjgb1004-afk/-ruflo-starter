import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NumberPicker } from "@/components/NumberPicker";
import { LottoBall } from "@/components/LottoBall";
import { useMyLottoTickets } from "@/features/mylotto/useMyLottoTickets";
import { upcomingDrawNo } from "@/features/generator/geniusGenerator";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";

const PICK_COUNT = 6;

// 고른 번호를 뺀 나머지에서 채운다. 시드 없는 완전 무작위 - 생성기와 달리 여기서는
// "이 사람만의 번호"가 목적이라 회차마다 같을 이유가 없다.
function fillRest(chosen: readonly number[]): number[] {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !chosen.includes(n));
  const picked = [...chosen];
  while (picked.length < PICK_COUNT) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked.sort((a, b) => a - b);
}

export default function TicketEntryScreen() {
  const router = useRouter();
  // 제스처바가 있는 기기에서는 마지막 줄이 그 뒤로 들어가 안 읽힌다.
  const insets = useSafeAreaInsets();
  const drawNo = useMemo(() => upcomingDrawNo(), []);
  const addTickets = useMyLottoTickets((s) => s.addTickets);
  const tickets = useMyLottoTickets((s) => s.tickets);
  const [selected, setSelected] = useState<number[]>([]);

  const complete = selected.length === PICK_COUNT;

  // 이미 보관함에 같은 회차·같은 번호가 있으면 저장해도 조용히 건너뛰어진다(addTickets의
  // 중복 방지). 저장했다고만 알리면 안 들어간 걸 모르니 미리 알려준다.
  const duplicate = useMemo(
    () =>
      complete &&
      Object.values(tickets).some((t) => t.drawNo === drawNo && t.numbers.join(",") === selected.join(",")),
    [complete, tickets, drawNo, selected],
  );

  const save = useCallback(() => {
    addTickets([{ drawNo, numbers: selected, purchaseType: "수동" }]);
    Alert.alert("보관함에 저장했어요", `${drawNo}회 1게임을 넣었어요. 추첨 후 자동으로 확인해 드려요.`, [
      { text: "계속 입력", onPress: () => setSelected([]) },
      { text: "보관함 열기", onPress: () => router.replace("/mylotto") },
    ]);
  }, [addTickets, drawNo, selected, router]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{drawNo}회 번호 직접 입력</Text>
        <Text style={styles.subtitle}>
          번호 {PICK_COUNT}개를 고르면 저장할 수 있어요. 몇 개만 고르고 나머지는 자동으로 채워도 돼요.
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
        <NumberPicker selected={selected} onChange={setSelected} max={PICK_COUNT} />
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.secondaryButton, complete && styles.buttonDisabled]}
          onPress={() => setSelected(fillRest(selected))}
          disabled={complete}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>나머지 자동</Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryButton, selected.length === 0 && styles.buttonDisabled]}
          onPress={() => setSelected([])}
          disabled={selected.length === 0}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>지우기</Text>
        </Pressable>
      </View>

      {duplicate && <Text style={styles.warning}>이 번호는 이미 보관함에 있어요. 저장해도 하나로 유지돼요.</Text>}

      <Pressable
        style={[styles.primaryButton, !complete && styles.buttonDisabled]}
        onPress={save}
        disabled={!complete}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>보관함에 저장</Text>
      </Pressable>

      <Text style={styles.disclaimer}>
        직접 적어둔 번호도 추첨 후 자동으로 맞춰봐 드려요. 모든 번호 조합의 당첨 확률은 같아요.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
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
  warning: { fontSize: 13, color: colors.textSecondary, textAlign: "center" },
  disclaimer: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
});
