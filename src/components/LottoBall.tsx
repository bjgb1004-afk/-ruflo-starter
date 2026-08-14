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

interface LottoBallProps {
  number: number;
  isBonus?: boolean;
  size?: "xs" | "small" | "large";
}

export function LottoBall({ number, isBonus = false, size = "large" }: LottoBallProps) {
  const { breakpoint } = useResponsive();
  const color = getBallColor(number);
  const bgColor = getBackgroundColor(color);
  const multiplier = getSizeMultiplier(breakpoint);

  const sizeStyles = {
    large: { width: 50 * multiplier, height: 50 * multiplier },
    small: { width: 36 * multiplier, height: 36 * multiplier },
    xs: { width: 22 * multiplier, height: 22 * multiplier },
  };

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
        sizeStyles[size],
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
