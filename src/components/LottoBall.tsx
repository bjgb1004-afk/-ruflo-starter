import { StyleSheet, Text, View } from "react-native";
import { useResponsive } from "@/utils/responsive";

type BallColor = "yellow" | "blue" | "red" | "gray" | "green";

function getBallColor(num: number): BallColor {
  if (num >= 1 && num <= 10) return "yellow";
  if (num >= 11 && num <= 20) return "blue";
  if (num >= 21 && num <= 30) return "red";
  if (num >= 31 && num <= 40) return "gray";
  return "green"; // 41-45
}

function getBackgroundColor(color: BallColor): string {
  const colors = {
    yellow: "#FFD100",
    blue: "#1F77D2",
    red: "#EE5A52",
    gray: "#666666",
    green: "#22B14C",
  };
  return colors[color];
}

function getSizeMultiplier(breakpoint: "small" | "medium" | "large"): number {
  if (breakpoint === "small") return 0.85;
  return 1;
}

const BALL_SIZE_PX: Record<"xs" | "small" | "large", number> = { xs: 22, small: 36, large: 50 };

// 실제 렌더링되는 공 지름(반응형 배율 적용 후) - TicketNumberRow가 안 맞은 번호(평범한
// 텍스트) 칸 폭을 여기에 맞춰야 공과 텍스트가 같은 줄에서 삐뚤어지지 않는다. 여기 값이
// 유일한 기준이라 이후 공 크기를 바꿔도 두 컴포넌트가 따로 어긋날 일이 없다.
export function getBallSizePx(size: "xs" | "small" | "large", breakpoint: "small" | "medium" | "large"): number {
  return BALL_SIZE_PX[size] * getSizeMultiplier(breakpoint);
}

interface LottoBallProps {
  number: number;
  isBonus?: boolean;
  size?: "xs" | "small" | "large";
}

export function LottoBall({ number, isBonus = false, size = "large" }: LottoBallProps) {
  const { breakpoint } = useResponsive();
  const color = getBallColor(number);
  const bgColor = getBackgroundColor(color);
  const diameter = getBallSizePx(size, breakpoint);

  const fontSizes = {
    large: 18,
    small: 13,
    xs: 9,
  };

  return (
    <View
      style={[
        styles.ball,
        { backgroundColor: bgColor },
        { width: diameter, height: diameter },
        isBonus && styles.ballBonus,
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize: fontSizes[size] },
          { color: color === "yellow" ? "#333" : "#fff" },
        ]}
      >
        {number}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ball: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 50,
  },
  ballBonus: {
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  text: {
    fontWeight: "700",
  },
});
