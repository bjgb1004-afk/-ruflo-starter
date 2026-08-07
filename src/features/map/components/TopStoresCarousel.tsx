import { memo, useCallback } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
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

// 지도 하단에 떠 있는 "내 주변 TOP5" 가로 스와이프 카드. 지도 위 배지만으로는
// 이름/거리/실적을 한눈에 비교하기 어려워서, 목록 형태로 훑어볼 수 있게 보완한다.
export const TopStoresCarousel = memo(function TopStoresCarousel({ stores, onPressStore }: Props) {
  const top5 = stores.slice(0, 5);

  const renderItem = useCallback(
    ({ item, index }: { item: NearbyStoreRow; index: number }) => (
      <Pressable style={styles.card} onPress={() => onPressStore(item.store_id)}>
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
    ),
    [onPressStore],
  );

  const keyExtractor = useCallback((item: NearbyStoreRow) => item.store_id, []);

  if (top5.length === 0) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <FlatList
        horizontal
        data={top5}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: spacing.md },
  list: { paddingHorizontal: spacing.md, gap: spacing.sm },
  card: {
    width: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginRight: spacing.sm,
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
