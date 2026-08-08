import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type DimensionValue } from "react-native";
import { colors, radius } from "@/constants/theme";

interface Props {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: object;
}

// 로딩 중임을 빈 화면/스피너보다 자연스럽게 보여주기 위한 펄스 애니메이션 플레이스홀더.
// 실제 콘텐츠와 비슷한 크기의 사각형을 겹쳐 배치해 "곧 이 자리에 뭐가 나온다"는 걸 암시한다.
export function Skeleton({ width = "100%", height = 16, borderRadius = radius.sm, style }: Props) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.base, { width, height, borderRadius, opacity }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.border },
});
