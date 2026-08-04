import { FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { getTopRankedStores } from "@/features/stores/api/storesApi";

export default function RankingScreen() {
  const { data: stores = [] } = useQuery({
    queryKey: ["stores", "ranking"],
    queryFn: () => getTopRankedStores(50),
  });

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={stores}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Link href={`/store/${item.id}`} asChild>
          <View style={styles.row}>
            <Text style={styles.rank}>{item.nation_rank ?? "-"}</Text>
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                1등 {item.first_prize_count}회 · 2등 {item.second_prize_count}회
              </Text>
            </View>
          </View>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  rank: { width: 28, fontWeight: "700" },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  meta: { color: "#666", marginTop: 2 },
});
