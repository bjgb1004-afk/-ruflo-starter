import { Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useMemo, useCallback } from "react";
import { useFavorites, type FavoriteStore } from "@/features/favorites/useFavorites";
import { useRecentlyViewed, type RecentStore } from "@/features/favorites/useRecentlyViewed";
import { useAuth } from "@/features/auth/useAuth";

type Section =
  | { type: "header"; title: string }
  | { type: "favorite"; store: FavoriteStore }
  | { type: "recent"; store: RecentStore }
  | { type: "empty"; message: string };

export default function FavoritesScreen() {
  const router = useRouter();
  const favoriteMap = useFavorites((s) => s.stores);
  const recentStores = useRecentlyViewed((s) => s.stores);
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

    result.push({ type: "header", title: "📜 최근 본 판매점" });
    if (recentStores.length === 0) {
      result.push({ type: "empty", message: "최근 본 판매점이 여기에 표시됩니다." });
    } else {
      recentStores.forEach((store) => result.push({ type: "recent", store }));
    }

    return result;
  }, [favorites, recentStores, isLoggedIn]);

  return (
    <FlatList
      style={styles.container}
      data={sections}
      keyExtractor={(item, idx) =>
        item.type === "header" ? `header-${item.title}` : item.type === "empty" ? `empty-${idx}` : item.store.id
      }
      renderItem={({ item }) => {
        if (item.type === "header") {
          return <Text style={styles.sectionTitle}>{item.title}</Text>;
        }
        if (item.type === "empty") {
          return <Text style={styles.emptyText}>{item.message}</Text>;
        }
        return (
          <Pressable style={styles.row} onPress={() => handlePress(item.store.id)}>
            <Text style={styles.rowName}>{item.store.name}</Text>
            <Text style={styles.rowAddress}>{item.store.address}</Text>
          </Pressable>
        );
      }}
      ListFooterComponent={
        <Text style={styles.dataLossNotice}>
          ⚠️ 즐겨찾기·최근본 목록은 이 기기에만 저장돼요. 앱을 삭제하면 함께 사라질 수 있어요.
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
