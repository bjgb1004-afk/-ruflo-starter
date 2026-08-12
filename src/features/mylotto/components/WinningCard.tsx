import { forwardRef } from "react";
import { View, Text, StyleSheet, type LayoutChangeEvent } from "react-native";
import type { MyLottoTicket } from "@/features/mylotto/useMyLottoTickets";
import { LottoBall } from "@/components/LottoBall";
import { colors, spacing, radius, numericFont } from "@/constants/theme";

const RANK_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "1등",
  2: "2등",
  3: "3등",
  4: "4등",
  5: "5등",
};

interface Props {
  ticket: MyLottoTicket;
  onLayout?: (event: LayoutChangeEvent) => void;
}

// 캡처 전용 카드. 화면 밖(captureOffscreen)에 렌더링된 뒤 view-shot으로 캡처되므로
// 스크롤/터치 등 상호작용은 필요 없고, 공유했을 때 보기 좋은 고정 레이아웃만 신경 쓴다.
export const WinningCard = forwardRef<View, Props>(function WinningCard({ ticket, onLayout }, ref) {
  return (
    <View ref={ref} style={styles.card} onLayout={onLayout}>
      <Text style={styles.brand}>🍀 복권명당</Text>
      <Text style={styles.rank}>{ticket.rank ? RANK_LABEL[ticket.rank] : ""} 당첨</Text>
      <Text style={styles.draw}>{ticket.drawNo}회</Text>
      <View style={styles.numbersRow}>
        {ticket.numbers.map((n) => (
          <LottoBall key={n} number={n} size="small" />
        ))}
      </View>
      <Text style={styles.amount}>{ticket.prizeAmount.toLocaleString()}원</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 320,
    padding: spacing.xl,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  brand: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "700" },
  rank: { fontSize: 22, color: colors.goldBright, fontWeight: "800" },
  draw: { fontSize: 14, color: "#fff", fontWeight: "600" },
  numbersRow: { flexDirection: "row", gap: spacing.xs, marginVertical: spacing.sm, flexWrap: "wrap", justifyContent: "center" },
  amount: { fontSize: 26, color: "#fff", fontWeight: "800", fontFamily: numericFont.bold },
});
