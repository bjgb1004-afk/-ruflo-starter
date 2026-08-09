import { StyleSheet, Text, View } from "react-native";

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

interface LottoBallProps {
  number: number;
  isBonus?: boolean;
  size?: "small" | "large";
}

export function LottoBall({ number, isBonus = false, size = "large" }: LottoBallProps) {
  const color = getBallColor(number);
  const bgColor = getBackgroundColor(color);
  const isLarge = size === "large";

  return (
    <View
      style={[
        styles.ball,
        { backgroundColor: bgColor },
        isLarge ? styles.ballLarge : styles.ballSmall,
        isBonus && styles.ballBonus,
      ]}
    >
      <Text style={[styles.text, isLarge ? styles.textLarge : styles.textSmall, { color: color === "yellow" ? "#333" : "#fff" }]}>
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
  ballLarge: {
    width: 50,
    height: 50,
  },
  ballSmall: {
    width: 36,
    height: 36,
  },
  ballBonus: {
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  text: {
    fontWeight: "700",
  },
  textLarge: {
    fontSize: 18,
  },
  textSmall: {
    fontSize: 13,
  },
});
