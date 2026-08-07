import { View, Text, Switch, StyleSheet, ActivityIndicator } from "react-native";
import { useGeofencing } from "./useGeofencing";

export function GeofenceToggle() {
  const { status, errorMessage, selectedCount, enable, disable } = useGeofencing();

  const handleToggle = (value: boolean) => {
    if (value) enable();
    else disable();
  };

  const subtitle =
    status === "error" && errorMessage
      ? errorMessage
      : selectedCount === 0
        ? "아래 목록에서 🔕 아이콘을 눌러 알림 받을 판매점을 선택하세요"
        : `선택한 판매점 ${selectedCount}개 근처에 가면 알려드려요`;

  return (
    <View style={styles.container}>
      <View style={styles.textGroup}>
        <Text style={styles.title}>🔔 명당 도착 알림</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {status === "loading" ? (
        <ActivityIndicator />
      ) : (
        <Switch
          value={status === "enabled"}
          onValueChange={handleToggle}
          disabled={selectedCount === 0 && status !== "enabled"}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f0f8ff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    gap: 12,
  },
  textGroup: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: "700", color: "#000" },
  subtitle: { fontSize: 12, color: "#666" },
});
