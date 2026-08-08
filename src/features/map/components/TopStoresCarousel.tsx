import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NearbyStoreRow } from "@/types/database.types";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

const RANK_COLOR: Record<number, string> = {
  0: colors.goldBright,
  1: colors.silver,
  2: colors.bronze,
};

interface Props {
  stores: NearbyStoreRow[];
  onPressStore: (storeId: string) => void;
}

// 지도 하단에 떠 있는 "내 주변 TOP3" 카드. 원래 5장을 가로 스크롤로 보여줬는데,
// 한 화면에 옆으로 안 넘기고 다 보이는 게 낫다는 피드백으로 3장으로 줄이고
// 고정폭 스크롤 대신 화면 폭에 맞춰 나눠지는 3칸 행으로 바꿨다.
export const TopStoresCarousel = memo(function TopStoresCarousel({ stores, onPressStore }: Props) {
  const top3 = stores.slice(0, 3);

  const handlePress = useCallback((storeId: string) => onPressStore(storeId), [onPressStore]);

  if (top3.length === 0) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.row}>
        {top3.map((item, index) => (
          <Pressable key={item.store_id} style={styles.card} onPress={() => handlePress(item.store_id)}>
            <View style={[styles.rankChip, { backgroundColor: RANK_COLOR[index] ?? colors.rankNeutral }]}>
              <Text style={styles.rankChipText}>{index + 1}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.meta}>
              {(item.distance_m / 1000).toFixed(1)}km · 1등 {item.first_prize_count}회
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: spacing.md },
  row: { flexDirection: "row", paddingHorizontal: spacing.md, gap: spacing.sm },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...cardShadow,
  },
  rankChip: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  rankChipText: { fontSize: 12, fontWeight: "800", color: "#fff", fontFamily: numericFont.bold },
  name: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  meta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: numericFont.regular,
  },
});
