import { StyleSheet, Text, View, FlatList } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getStoreById } from "@/features/stores/api/storesApi";
import { getWinningsByStore } from "@/features/draws/api/drawHistoryApi";

export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: store } = useQuery({
    queryKey: ["store", id],
    queryFn: () => getStoreById(id),
    enabled: !!id,
  });

  const { data: winnings = [] } = useQuery({
    queryKey: ["store", id, "winnings"],
    queryFn: () => getWinningsByStore(id),
    enabled: !!id,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{store?.name}</Text>
      <Text style={styles.address}>{store?.address}</Text>

      <Text style={styles.sectionTitle}>당첨 이력</Text>
      <FlatList
        data={winnings}
        keyExtractor={(item) => `${item.draw_no}-${item.rank}`}
        renderItem={({ item }) => (
          <View style={styles.winRow}>
            <Text>{item.draw_no}회</Text>
            <Text>{item.rank}등</Text>
            <Text>{item.draw_date}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  name: { fontSize: 20, fontWeight: "700" },
  address: { color: "#666", marginTop: 4, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  winRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
});
