import { memo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { getLatestFirstPrizeWinners } from "@/features/draws/api/drawHistoryApi";
import { colors, spacing, radius } from "@/constants/theme";

function formatDrawDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export const NewWinnerBanner = memo(function NewWinnerBanner() {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["draws", "latest-winners"],
    queryFn: getLatestFirstPrizeWinners,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const handlePress = useCallback(() => {
    if (data) router.push(`/draw/${data.drawNo}`);
  }, [data, router]);

  if (!data || data.stores.length === 0) return null;

  const [first, ...rest] = data.stores;
  const label = rest.length > 0 ? `${first.storeName} 외 ${rest.length}곳` : first.storeName;

  return (
    <Pressable style={styles.banner} onPress={handlePress}>
      <Text style={styles.text}>
        🎉 {data.drawNo}회({formatDrawDate(data.drawDate)}) 1등 배출 · {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.goldLight,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  text: { fontSize: 13, color: colors.primaryDark, fontWeight: "600" },
});
