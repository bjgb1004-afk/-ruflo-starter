import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMyLottoTickets, LOTTO_UNIT_PRICE, type MyLottoTicket } from "@/features/mylotto/useMyLottoTickets";
import { useAutoCheckTickets } from "@/features/mylotto/useAutoCheckTickets";
import { computeVaultSummary, computeFrequentNumbers } from "@/features/mylotto/stats";
import { WinningCard } from "@/features/mylotto/components/WinningCard";
import { LottoBall } from "@/components/LottoBall";
import { shareWinningCard, ShareCardError } from "@/features/mylotto/shareWinningCard";
import { reportError } from "@/lib/errorLog";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";
import { useResponsive, getResponsiveSpacing, getResponsiveFontSize } from "@/utils/responsive";

const RANK_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "1등",
  2: "2등",
  3: "3등",
  4: "4등",
  5: "5등",
};

function formatWon(n: number): string {
  return `${n.toLocaleString()}원`;
}

// 두 값(구매액/당첨금) 중 큰 쪽을 기준으로 막대 너비 비율을 계산한다. SVG 없이 flexbox 폭
// 퍼센트만으로 충분해 새 차트 라이브러리를 추가하지 않았다.
function RoiBars({ spent, won, breakpoint }: { spent: number; won: number; breakpoint: string }) {
  const max = Math.max(spent, won, 1);
  return (
    <View style={styles.roiContainer}>
      <View style={styles.roiRow}>
        <Text style={[styles.roiLabel, { fontSize: getResponsiveFontSize(12, breakpoint as any) }]}>
          구매액
        </Text>
        <View style={styles.roiTrack}>
          <View style={[styles.roiBar, styles.roiBarSpent, { width: `${(spent / max) * 100}%` }]} />
        </View>
        <Text style={[styles.roiValue, { fontSize: getResponsiveFontSize(12, breakpoint as any) }]}>
          {formatWon(spent)}
        </Text>
      </View>
      <View style={styles.roiRow}>
        <Text style={[styles.roiLabel, { fontSize: getResponsiveFontSize(12, breakpoint as any) }]}>
          당첨금
        </Text>
        <View style={styles.roiTrack}>
          <View style={[styles.roiBar, styles.roiBarWon, { width: `${(won / max) * 100}%` }]} />
        </View>
        <Text style={[styles.roiValue, { fontSize: getResponsiveFontSize(12, breakpoint as any) }]}>
          {formatWon(won)}
        </Text>
      </View>
    </View>
  );
}

const TicketRow = ({ ticket, index, onShare, breakpoint }: { ticket: MyLottoTicket; index: number; onShare: (t: MyLottoTicket) => void; breakpoint: string }) => (
  <View style={styles.ticketRow}>
    <View style={styles.ticketIndex}>
      <Text style={[styles.ticketIndexText, { fontSize: getResponsiveFontSize(11, breakpoint as any) }]}>
        {String.fromCharCode(97 + index)}
      </Text>
    </View>
    <View style={styles.ticketInfo}>
      {ticket.purchaseType && (
        <View style={styles.methodTag}>
          <Text style={[styles.methodTagText, { fontSize: getResponsiveFontSize(10, breakpoint as any) }]}>
            {ticket.purchaseType}
          </Text>
        </View>
      )}
      <View style={styles.ticketBalls}>
        {ticket.numbers.map((n) => (
          <LottoBall key={n} number={n} size="small" />
        ))}
      </View>
    </View>
    <View style={styles.ticketRight}>
      {!ticket.checked ? (
        <View style={styles.pendingBadge}>
          <Text style={[styles.pendingBadgeText, { fontSize: getResponsiveFontSize(11, breakpoint as any) }]}>
            추첨 대기
          </Text>
        </View>
      ) : ticket.rank ? (
        <>
          <View style={styles.winBadge}>
            <Text style={[styles.winBadgeText, { fontSize: getResponsiveFontSize(11, breakpoint as any) }]}>
              {RANK_LABEL[ticket.rank]}
            </Text>
          </View>
          <Text style={[styles.winAmount, { fontSize: getResponsiveFontSize(12, breakpoint as any) }]}>
            {formatWon(ticket.prizeAmount)}
          </Text>
          <Pressable style={styles.shareButton} onPress={() => onShare(ticket)}>
            <Text style={[styles.shareButtonText, { fontSize: getResponsiveFontSize(11, breakpoint as any) }]}>
              공유
            </Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.loseBadge}>
          <Text style={[styles.loseBadgeText, { fontSize: getResponsiveFontSize(11, breakpoint as any) }]}>
            낙첨
          </Text>
        </View>
      )}
    </View>
  </View>
);

interface TicketGroup {
  key: string;
  drawNo: number;
  savedAt: string;
  tickets: MyLottoTicket[];
}

// 한 번의 QR 스캔(한 장의 용지)으로 함께 저장된 게임들을 하나의 카드로 묶는다. groupId가
// 없는 옛 데이터(이 필드가 생기기 전 저장분)는 각자 자기 id를 그룹 키로 써서 개별 카드가 된다.
function groupTickets(tickets: MyLottoTicket[]): TicketGroup[] {
  const map = new Map<string, TicketGroup>();
  for (const t of tickets) {
    const key = t.groupId ?? t.id;
    const existing = map.get(key);
    if (existing) existing.tickets.push(t);
    else map.set(key, { key, drawNo: t.drawNo, savedAt: t.savedAt, tickets: [t] });
  }
  return [...map.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

const TicketGroupCard = ({
  group,
  onShare,
  onDelete,
  breakpoint,
}: {
  group: TicketGroup;
  onShare: (t: MyLottoTicket) => void;
  onDelete: (group: TicketGroup) => void;
  breakpoint: string;
}) => {
  // 회차(그룹)마다 따로 접고 펼 수 있게 - 보관함에 여러 회차가 쌓이면 전부 펼쳐진 채로
  // 쭉 나열되어 원하는 회차를 찾기 번거롭다는 피드백. 기본은 펼침 상태로 둬서 기존
  // 화면과 동일하게 보이되, 필요할 때 접어서 목록을 짧게 볼 수 있게 한다.
  const [expanded, setExpanded] = useState(true);
  const handleToggle = useCallback(() => setExpanded((v) => !v), []);

  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeaderRow}>
        <Pressable style={styles.groupHeaderInfo} onPress={handleToggle}>
          <View style={styles.groupDrawRow}>
            <Text style={[styles.groupDraw, { fontSize: getResponsiveFontSize(14, breakpoint as any) }]}>
              {group.drawNo}회
            </Text>
            <Text style={[styles.groupChevron, { fontSize: getResponsiveFontSize(11, breakpoint as any) }]}>
              {expanded ? "▲" : "▼"}
            </Text>
          </View>
          <Text style={[styles.groupSpent, { fontSize: getResponsiveFontSize(12, breakpoint as any) }]}>
            {formatWon(group.tickets.length * LOTTO_UNIT_PRICE)}치 · {group.tickets.length}게임
          </Text>
        </Pressable>
        <Pressable hitSlop={8} style={styles.deleteButton} onPress={() => onDelete(group)}>
          <Text style={styles.deleteButtonIcon}>🗑️</Text>
        </Pressable>
      </View>
      {expanded &&
        group.tickets.map((t, idx) => (
          <TicketRow key={t.id} ticket={t} index={idx} onShare={onShare} breakpoint={breakpoint} />
        ))}
    </View>
  );
};

export default function MyLottoScreen() {
  useAutoCheckTickets();
  const router = useRouter();
  const { breakpoint } = useResponsive();
  const ticketsMap = useMyLottoTickets((s) => s.tickets);
  const removeTicket = useMyLottoTickets((s) => s.removeTicket);
  const tickets = useMemo(() => Object.values(ticketsMap).sort((a, b) => b.savedAt.localeCompare(a.savedAt)), [ticketsMap]);
  const ticketGroups = useMemo(() => groupTickets(tickets), [tickets]);

  // 그룹(한 번에 스캔한 용지) 단위로 삭제한다 - 게임 하나만 따로 지우는 것보다
  // "이 용지를 보관함에서 뺀다"는 사용자의 실제 의도에 더 맞는다.
  const handleDeleteGroup = useCallback(
    (group: TicketGroup) => {
      Alert.alert("보관함에서 삭제", `${group.drawNo}회 ${group.tickets.length}게임을 삭제할까요?`, [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => group.tickets.forEach((t) => removeTicket(t.id)),
        },
      ]);
    },
    [removeTicket],
  );

  const summary = useMemo(() => computeVaultSummary(tickets), [tickets]);
  const frequentNumbers = useMemo(() => computeFrequentNumbers(tickets), [tickets]);
  // Android 엣지-투-엣지 환경에서 목록을 끝까지 내리면 시스템 뒤로가기 바에 마지막 줄이
  // 가려 조작이 어렵다는 신고 - 하단 안전영역만큼 스크롤 끝에 여백을 더한다.
  const insets = useSafeAreaInsets();

  const [shareTicket, setShareTicket] = useState<MyLottoTicket | null>(null);
  const captureRef = useRef<View>(null);

  const handleShare = useCallback((ticket: MyLottoTicket) => {
    setShareTicket(ticket);
  }, []);

  // WinningCard가 실제로 렌더링된 뒤(다음 프레임)에 캡처해야 빈 화면이 캡처되지 않는다.
  const handleCaptureReady = useCallback(async () => {
    if (!shareTicket) return;
    if (!captureRef.current) {
      // 캡처 대상 View가 아직 마운트되지 않은 경우(레이아웃 타이밍 문제 등) - 앱이 죽지 않고
      // 사용자에게 실패를 알린다.
      reportError(new Error("captureRef not ready on layout"), "mylotto-share-capture");
      Alert.alert("공유 실패", "이미지 생성 또는 공유에 실패했습니다.");
      setShareTicket(null);
      return;
    }
    try {
      await shareWinningCard(captureRef.current);
    } catch (err) {
      const message =
        err instanceof ShareCardError ? err.message : "이미지 생성 또는 공유에 실패했습니다.";
      Alert.alert("공유 실패", message);
    } finally {
      setShareTicket(null);
    }
  }, [shareTicket]);

  if (tickets.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyEmoji, { fontSize: getResponsiveFontSize(40, breakpoint) }]}>
          🎟️
        </Text>
        <Text style={[styles.emptyText, { fontSize: getResponsiveFontSize(16, breakpoint) }]}>
          저장된 복권이 없어요
        </Text>
        <Text style={[styles.emptySubtext, { fontSize: getResponsiveFontSize(13, breakpoint) }]}>
          QR 스캔 후 보관함에 저장하면 여기에 모여요.
        </Text>
        <Pressable style={styles.scanButton} onPress={() => router.push("/scan")}>
          <Text style={[styles.scanButtonText, { fontSize: getResponsiveFontSize(14, breakpoint) }]}>
            QR 스캔하러 가기
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: getResponsiveFontSize(15, breakpoint) }]}>
            수익률
          </Text>
          <RoiBars spent={summary.totalSpent} won={summary.totalWon} breakpoint={breakpoint} />
          <Text style={[styles.summaryFootnote, { fontSize: getResponsiveFontSize(12, breakpoint) }]}>
            총 {summary.totalTickets}게임 · 당첨 {summary.winCount}건
          </Text>
        </View>

        {frequentNumbers.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontSize: getResponsiveFontSize(15, breakpoint) }]}>
              내가 자주 뽑은 번호 Best{frequentNumbers.length}
            </Text>
            <View style={styles.numberRow}>
              {frequentNumbers.map((item) => (
                <View key={item.number} style={styles.numberBubble}>
                  <LottoBall number={item.number} size="small" />
                  <Text style={[styles.numberBubbleCount, { fontSize: getResponsiveFontSize(10, breakpoint) }]}>
                    {item.count}회
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: getResponsiveFontSize(15, breakpoint) }]}>
            내 복권 목록
          </Text>
          {ticketGroups.map((g) => (
            <TicketGroupCard
              key={g.key}
              group={g}
              onShare={handleShare}
              onDelete={handleDeleteGroup}
              breakpoint={breakpoint}
            />
          ))}
        </View>

        <Text style={[styles.dataLossNotice, { fontSize: getResponsiveFontSize(11, breakpoint) }]}>
          ⚠️ 보관함은 이 기기에만 저장돼요. 앱을 삭제하면 저장된 복권 내역이 함께 사라질 수 있어요.
        </Text>
      </ScrollView>

      {shareTicket && (
        <View style={styles.captureOffscreen} pointerEvents="none">
          <WinningCard ref={captureRef} ticket={shareTicket} onLayout={handleCaptureReady} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  emptyEmoji: {},
  emptyText: { fontWeight: "700", color: colors.textPrimary },
  emptySubtext: { color: colors.textMuted, textAlign: "center" },
  scanButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  scanButtonText: { color: "#fff", fontWeight: "700" },
  section: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  sectionTitle: { fontWeight: "700", color: colors.textPrimary },
  summaryFootnote: { color: colors.textMuted },

  roiContainer: { gap: spacing.sm },
  roiRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  roiLabel: { width: 48, color: colors.textSecondary },
  roiTrack: { flex: 1, height: 14, borderRadius: radius.pill, backgroundColor: colors.background, overflow: "hidden" },
  roiBar: { height: "100%", borderRadius: radius.pill },
  roiBarSpent: { backgroundColor: colors.rankNeutral },
  roiBarWon: { backgroundColor: colors.goldBright },
  roiValue: {
    width: 90,
    textAlign: "right",
    fontWeight: "700",
    color: colors.textPrimary,
    fontFamily: numericFont.medium,
  },

  numberRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  numberBubble: {
    width: 56,
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  numberBubbleCount: { color: colors.textMuted, marginTop: 2 },

  groupCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupHeaderInfo: { flex: 1, gap: 2 },
  groupDrawRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  groupDraw: { fontWeight: "800", color: colors.textPrimary, fontFamily: numericFont.medium },
  groupChevron: { color: colors.textMuted },
  groupSpent: { color: colors.textSecondary, fontFamily: numericFont.regular },
  deleteButton: { padding: spacing.xs },
  deleteButtonIcon: { fontSize: 16 },
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  ticketIndex: { minWidth: 20, alignItems: "center" },
  ticketIndexText: { fontWeight: "700", color: colors.textSecondary },
  ticketInfo: { flex: 1, gap: 2 },
  methodTag: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  methodTagText: { color: colors.textSecondary, fontWeight: "600" },
  ticketBalls: { flexDirection: "row", gap: 3, flexWrap: "wrap" },
  ticketRight: { alignItems: "flex-end", gap: 4 },
  pendingBadge: { backgroundColor: colors.background, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pendingBadgeText: { color: colors.textMuted, fontWeight: "600" },
  winBadge: { backgroundColor: colors.gold, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  winBadgeText: { color: "#fff", fontWeight: "700" },
  winAmount: { fontWeight: "700", color: colors.primary, fontFamily: numericFont.medium },
  loseBadge: { backgroundColor: colors.rankNeutral, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  loseBadgeText: { color: "#fff", fontWeight: "600" },
  shareButton: { marginTop: 2, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  shareButtonText: { color: colors.primary, fontWeight: "700" },

  captureOffscreen: { position: "absolute", top: -9999, left: -9999 },
  dataLossNotice: {
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    lineHeight: 16,
  },
});
