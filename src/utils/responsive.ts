import { useWindowDimensions } from "react-native";

type Breakpoint = "small" | "medium" | "large";

interface ResponsiveValue {
  breakpoint: Breakpoint;
  isSmall: boolean;
  isMedium: boolean;
  isLarge: boolean;
  screenWidth: number;
  screenHeight: number;
}

export function useResponsive(): ResponsiveValue {
  const { width, height } = useWindowDimensions();

  let breakpoint: Breakpoint;
  if (width < 480) {
    breakpoint = "small";
  } else if (width < 768) {
    breakpoint = "medium";
  } else {
    breakpoint = "large";
  }

  return {
    breakpoint,
    isSmall: breakpoint === "small",
    isMedium: breakpoint === "medium",
    isLarge: breakpoint === "large",
    screenWidth: width,
    screenHeight: height,
  };
}

export function getResponsiveSpacing(token: number, breakpoint: Breakpoint): number {
  if (breakpoint === "small") return Math.round(token * 0.85);
  if (breakpoint === "medium") return token;
  return Math.round(token * 1.1);
}

export function getResponsiveFontSize(size: number, breakpoint: Breakpoint): number {
  if (breakpoint === "small") {
    if (size >= 18) return Math.round(size * 0.9);
    if (size >= 14) return Math.round(size * 0.95);
    return size;
  }
  return size;
}

export function getResponsiveValue<T>(small: T, medium: T, large: T, breakpoint: Breakpoint): T {
  if (breakpoint === "small") return small;
  if (breakpoint === "medium") return medium;
  return large;
}
