import { useEffect } from "react";
import { View, Text, Pressable, Modal, ScrollView, Switch, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getRecentNotices } from "@/features/notices/api/noticesApi";
import { useUpdatePopup } from "@/features/notices/useUpdatePopup";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";

// 업데이트 소식 팝업. app/_layout.tsx에 한 번만 달아두고 전역 상태로 연다.
//
// 자동으로 뜨는 조건: 자동 띄우기가 켜져 있고, 가장 최근 소식이 마지막으로 본 것과 다를 때.
// 그래서 같은 소식으로 두 번 뜨지 않고, 새 소식이 올라오면 다시 뜬다.
//
// 닫을 때 "본 소식"으로 기록한다. 스위치를 끄는 것과는 별개다 - 끄면 자동으로만 안 뜨고,
// 앱 설정 > "업데이트 소식 다시 보기"로 언제든 열 수 있다.

function formatDate(iso: string): string {
  // created_at은 시간대 없는 타임스탬프(UTC로 들어간다). 날짜만 보여주므로 그대로 자른다.
  return iso.slice(0, 10).replace(/-/g, ".");
}

export function UpdatePopup() {
  const open = useUpdatePopup((s) => s.open);
  const autoShow = useUpdatePopup((s) => s.autoShow);
  const seenId = useUpdatePopup((s) => s.seenId);
  const setOpen = useUpdatePopup((s) => s.setOpen);
  const setAutoShow = useUpdatePopup((s) => s.setAutoShow);
  const setSeenId = useUpdatePopup((s) => s.setSeenId);

  const { data: notices } = useQuery({
    queryKey: ["notices", "recent"],
    queryFn: () => getRecentNotices(5),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const latestId = notices?.[0]?.id;

  useEffect(() => {
    if (!autoShow || !latestId || latestId === seenId) return;
    setOpen(true);
  }, [autoShow, latestId, seenId, setOpen]);

  function close() {
    if (latestId) setSeenId(latestId);
    setOpen(false);
  }

  if (!open || !notices || notices.length === 0) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>📢 업데이트 소식</Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {notices.map((n) => (
              <View key={n.id} style={styles.item}>
                <Text style={styles.itemDate}>{formatDate(n.created_at)}</Text>
                <Text style={styles.itemTitle}>{n.title}</Text>
                <Text style={styles.itemMessage}>{n.message}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>앱 열 때 자동으로 보여주기</Text>
              <Text style={styles.toggleHint}>
                꺼도 앱 설정에서 언제든 다시 볼 수 있어요.
              </Text>
            </View>
            <Switch value={autoShow} onValueChange={setAutoShow} />
          </View>

          <Pressable style={styles.closeButton} onPress={close} accessibilityRole="button">
            <Text style={styles.closeButtonText}>확인</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    // 소식이 많아도 화면을 넘지 않게. 목록만 안에서 스크롤된다.
    maxHeight: "80%",
    ...cardShadow,
  },
  heading: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.md },
  item: { gap: 2 },
  itemDate: { fontSize: 11, color: colors.textMuted },
  itemTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  itemMessage: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  toggleHint: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
  closeButton: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  closeButtonText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
