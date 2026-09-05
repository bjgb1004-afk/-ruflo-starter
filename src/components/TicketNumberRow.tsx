import { View, Text, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from "react-native";
import { LottoBall, getBallSizePx } from "@/components/LottoBall";
import { useResponsive } from "@/utils/responsive";

// 실제 동행복권 공식 사이트처럼 당첨번호와 일치하는 숫자만 색공으로, 나머지는 일반
// 텍스트로 보여준다. winningSet이 없으면(draw 미로딩/추첨 전) 전부 색공으로 표시해
// 깨져 보이지 않게 한다.
//
// 보너스번호만 일치한 숫자는 색공으로 표시하지 않는다 - 등수는 본번호 개수로만 정해지는데
// (checkWinnings.ts), 보너스 일치를 공으로 강조하면 "본번호 2개 + 보너스 1개"를 "3개
// 일치"로 착각해 5등인 줄 알았다가 낙첨으로 떠서 혼란을 준다는 신고가 있었다. 동행복권
// 공식 사이트도 보너스 일치를 별도 강조하지 않는다.
export function TicketNumberRow({
  numbers,
  winningSet,
  ballSize,
  containerStyle,
  plainTextStyle,
}: {
  numbers: number[];
  winningSet: Set<number> | null | undefined;
  bonusNumber?: number;
  ballSize: "xs" | "small" | "large";
  containerStyle?: StyleProp<ViewStyle>;
  plainTextStyle?: StyleProp<TextStyle>;
}) {
  // LottoBall과 같은 지름(반응형 배율 포함)을 써서, 공(당첨 일치)이든 평범한 텍스트(불일치)든
  // 번호 하나가 항상 같은 폭을 차지하게 한다. 이게 없으면 두 자리 숫자만 있는 게임(예: 10~45
  // 사이 6개)이 한 자리 숫자가 섞인 게임보다 줄 폭이 넓어져, 카드 안에서만 랜덤하게
  // 줄바꿈되는 문제가 생긴다.
  const { breakpoint } = useResponsive();
  const slotWidth = getBallSizePx(ballSize, breakpoint);
  return (
    <View style={[styles.row, containerStyle]}>
      {numbers.map((n) => {
        const isMainMatch = !winningSet || winningSet.has(n);
        return isMainMatch ? (
          <LottoBall key={n} number={n} size={ballSize} />
        ) : (
          <Text key={n} style={[{ width: slotWidth, textAlign: "center" }, plainTextStyle]}>
            {n}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" },
});
