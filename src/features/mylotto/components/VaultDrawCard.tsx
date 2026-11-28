import { Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { LottoBall } from "@/components/LottoBall";
import { TicketNumberRow } from "@/components/TicketNumberRow";
import type { DrawSummary } from "@/features/draws/api/drawHistoryApi";
import { withGameLabel } from "@/features/mylotto/groupTickets";
import type { MyLottoTicket } from "@/features/mylotto/useMyLottoTickets";
import type { WinRank } from "@/features/qr/checkWinnings";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";

const RANK_LABEL: Record<Exclude<WinRank, null>, string> = {
  1: "1등",
  2: "2등",
  3: "3등",
  4: "4등",
  5: "5등",
};

/**
 * 보관함의 회차별 카드. 홈과 스캔 화면이 같은 카드를 쓴다 - 두 곳에 같은 그림을 따로 두면
 * 한쪽만 고쳐져서 어긋난다.
 *
 * draw가 있으면(결과가 나온 회차) 동행복권 공식 사이트처럼 당첨번호와 일치하는 숫자만
 * 색공으로, 나머지는 일반 텍스트로 표시한다. draw를 아직 못 받아온 동안(로딩 중/추첨 전)은
 * 전부 색공으로 보여준다.
 */
export function VaultDrawCard({
  drawNo,
  tickets,
  draw,
  onDelete,
}: {
  drawNo: number;
  tickets: MyLottoTicket[];
  draw: DrawSummary | null | undefined;
  onDelete: () => void;
}) {
  const winningSet = draw ? new Set(draw.winning_numbers) : null;
  const qrUrl = tickets.find((t) => t.qrUrl)?.qrUrl;
  return (
    <View style={styles.vaultCard}>
      <View style={styles.vaultCardMain}>
        <View style={styles.vaultCardHeader}>
          <Text style={styles.vaultCardTitle}>{drawNo}회</Text>
          {draw && (
            <View style={styles.vaultCardWinningBalls}>
              {draw.winning_numbers.map((n) => (
                <LottoBall key={n} number={n} size="xs" />
              ))}
              <Text style={styles.vaultCardPlus}>+</Text>
              <LottoBall number={draw.bonus_number} size="xs" />
            </View>
          )}
          <Pressable hitSlop={8} onPress={onDelete}>
            <Text style={styles.vaultCardDeleteIcon}>🗑️</Text>
          </Pressable>
        </View>
        {withGameLabel(tickets).map(({ ticket, label }) => (
          <View key={ticket.id} style={styles.vaultCardGame}>
            <Text style={styles.vaultCardGameIndex}>{label}</Text>
            <TicketNumberRow
              numbers={ticket.numbers}
              winningSet={winningSet}
              ballSize="xs"
              containerStyle={styles.vaultCardBalls}
              plainTextStyle={styles.vaultCardNumberPlain}
            />
            <View
              style={[
                styles.vaultCardBadge,
                ticket.checked
                  ? ticket.rank
                    ? styles.vaultCardBadgeWin
                    : styles.vaultCardBadgeLose
                  : styles.vaultCardBadgePending,
              ]}
            >
              <Text style={styles.vaultCardBadgeText}>
                {ticket.checked ? (ticket.rank ? RANK_LABEL[ticket.rank] : "낙첨") : "추첨 전"}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {qrUrl && (
        // 카드 세로 높이(minHeight:240, 5게임 기준으로 딱 맞춰둔 값)를 추가로 늘리지
        // 않도록 별도 줄 대신 게임 목록 오른쪽에 세로 중앙 정렬로 붙인다 - 텍스트 줄이
        // 하나 늘면 카드 목록이 스크롤(드래그)되는 문제가 있었다.
        <Pressable style={styles.vaultCardOfficialLink} onPress={() => WebBrowser.openBrowserAsync(qrUrl)}>
          <Text style={styles.vaultCardOfficialLinkText}>동행복권{"\n"}원본확인</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  vaultCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    ...cardShadow,
    minHeight: 240,
  },
  vaultCardMain: { flex: 1, gap: spacing.md },
  vaultCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  vaultCardTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  vaultCardWinningBalls: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  vaultCardPlus: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginHorizontal: 1 },
  vaultCardDeleteIcon: { fontSize: 16 },
  vaultCardOfficialLink: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  vaultCardOfficialLinkText: { fontSize: 10, fontWeight: "700", color: colors.primary, textAlign: "center", lineHeight: 14 },
  vaultCardGame: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  vaultCardGameIndex: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, minWidth: 18 },
  vaultCardBalls: { flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" },
  vaultCardNumberPlain: { fontSize: 12, fontWeight: "600", color: colors.textPrimary },
  vaultCardBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  vaultCardBadgeWin: { backgroundColor: colors.gold },
  vaultCardBadgeLose: { backgroundColor: colors.rankNeutral },
  vaultCardBadgePending: { backgroundColor: colors.rankNeutral },
  vaultCardBadgeText: { color: "#fff", fontWeight: "700", fontSize: 10 },
});
