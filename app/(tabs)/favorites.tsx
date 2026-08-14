import { Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useMemo, useCallback } from "react";
import { useFavorites, type FavoriteStore } from "@/features/favorites/useFavorites";
import { useAuth } from "@/features/auth/useAuth";
import { useResponsive, getResponsiveSpacing, getResponsiveFontSize } from "@/utils/responsive";

type Section =
  | { type: "header"; title: string }
  | { type: "favorite"; store: FavoriteStore }
  | { type: "empty"; message: string };

export default function FavoritesScreen() {
  const router = useRouter();
  const { breakpoint } = useResponsive();
  const favoriteMap = useFavorites((s) => s.stores);
  const isLoggedIn = useAuth((s) => !!s.user);

  const favorites = useMemo(() => Object.values(favoriteMap), [favoriteMap]);

  const handlePress = useCallback(
    (id: string) => {
      router.push(`/store/${id}`);
    },
    [router],
  );

  const sections: Section[] = useMemo(() => {
    const result: Section[] = [
      { type: "header", title: isLoggedIn ? "⭐ 즐겨찾기 (기기 간 동기화됨)" : "⭐ 즐겨찾기" },
    ];
    if (favorites.length === 0) {
      result.push({
        type: "empty",
        message: "판매점 상세에서 ☆를 눌러 즐겨찾기에 추가하세요.",
      });
    } else {
      favorites.forEach((store) => result.push({ type: "favorite", store }));
    }

    return result;
  }, [favorites, isLoggedIn]);

  return (
    <FlatList
      style={styles.container}
      data={sections}
      keyExtractor={(item, idx) =>
        item.type === "header" ? `header-${item.title}` : item.type === "empty" ? `empty-${idx}` : item.store.id
      }
      renderItem={({ item }) => {
        if (item.type === "header") {
          return <Text style={[styles.sectionTitle, { fontSize: getResponsiveFontSize(15, breakpoint), paddingHorizontal: getResponsiveSpacing(16, breakpoint) }]}>{item.title}</Text>;
        }
        if (item.type === "empty") {
          return <Text style={[styles.emptyText, { fontSize: getResponsiveFontSize(13, breakpoint), paddingHorizontal: getResponsiveSpacing(16, breakpoint) }]}>{item.message}</Text>;
        }
        return (
          <Pressable style={[styles.row, { paddingHorizontal: getResponsiveSpacing(16, breakpoint), paddingVertical: getResponsiveSpacing(14, breakpoint) }]} onPress={() => handlePress(item.store.id)}>
            <Text style={[styles.rowName, { fontSize: getResponsiveFontSize(15, breakpoint) }]}>{item.store.name}</Text>
            <Text style={[styles.rowAddress, { fontSize: getResponsiveFontSize(13, breakpoint) }]}>{item.store.address}</Text>
          </Pressable>
        );
      }}
      ListFooterComponent={
        <Text style={styles.dataLossNotice}>
          ⚠️ 즐겨찾기는 {isLoggedIn ? "클라우드에 저장돼요." : "이 기기에만 저장돼요. 앱을 삭제하면 함께 사라질 수 있어요."}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "#999",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowName: { fontSize: 15, fontWeight: "600", color: "#000" },
  rowAddress: { fontSize: 13, color: "#666", marginTop: 2 },
  dataLossNotice: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
    lineHeight: 16,
  },
});
