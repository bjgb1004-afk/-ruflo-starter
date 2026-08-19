import { View, Text, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from "react-native";
import { LottoBall } from "@/components/LottoBall";

// 실제 동행복권 공식 사이트처럼 당첨번호(+보너스번호)와 일치하는 숫자만 색공으로,
// 나머지는 일반 텍스트로 보여준다. winningSet이 없으면(draw 미로딩/추첨 전) 전부
// 색공으로 표시해 깨져 보이지 않게 한다.
//
// 본번호 일치와 보너스번호 일치는 반드시 시각적으로 구분해야 한다 - 등수 계산은 본번호
// 개수만으로 결정되고 보너스는 2등 판정에만 관여하는데(checkWinnings.ts), 둘 다 똑같은
// 공으로 칠하면 "본번호 2개 + 보너스 1개"를 "3개 일치"로 착각해 당첨(5등)인 줄 알았는데
// 낙첨으로 뜬다는 혼란을 준다. 보너스로만 맞은 공은 LottoBall의 isBonus(테두리)로 구분한다.
export function TicketNumberRow({
  numbers,
  winningSet,
  bonusNumber,
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
  return (
    <View style={[styles.row, containerStyle]}>
      {numbers.map((n) => {
        const isMainMatch = !winningSet || winningSet.has(n);
        const isBonusOnlyMatch = !isMainMatch && n === bonusNumber;
        return isMainMatch || isBonusOnlyMatch ? (
          <LottoBall key={n} number={n} size={ballSize} isBonus={isBonusOnlyMatch} />
        ) : (
          <Text key={n} style={plainTextStyle}>
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
