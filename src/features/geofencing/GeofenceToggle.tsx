import { View, Text, Switch, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useGeofencing } from "./useGeofencing";

export function GeofenceToggle() {
  const { status, errorMessage, selectedCount, enable, disable } = useGeofencing();

  // 판매점 상세의 🔔 아이콘에서 선택 즉시 disclosure+권한요청까지 처리되므로(app/store/[id].tsx),
  // 여기 스위치는 그때 "취소"를 눌렀거나 나중에 다시 켜고 싶을 때 쓰는 보조 경로다.
  // Google Play 정책: OS 위치 권한 팝업이 뜨기 전에, 왜 백그라운드 위치가 필요한지
  // 앱 자체 화면에서 먼저 명확히 알려야 한다(prominent disclosure).
  const handleToggle = (value: boolean) => {
    if (!value) {
      disable();
      return;
    }
    Alert.alert(
      "백그라운드 위치 접근 안내",
      "명당알림을 켜면, 선택한 로또 판매점 근처에 도착했을 때 앱이 백그라운드 상태여도 방문 알림을 보내드리기 위해 백그라운드 위치 정보에 접근합니다. 선택한 판매점 위치만 사용하며, 언제든 이 설정에서 끌 수 있습니다.",
      [
        { text: "취소", style: "cancel" },
        { text: "허용", onPress: enable },
      ],
    );
  };

  const subtitle =
    status === "error" && errorMessage
      ? errorMessage
      : selectedCount === 0
        ? "판매점 상세에서 🔕 아이콘을 눌러 알림 받을 판매점을 선택하세요"
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
