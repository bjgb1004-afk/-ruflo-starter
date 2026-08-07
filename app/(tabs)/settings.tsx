import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/features/auth/useAuth";
import { GeofenceToggle } from "@/features/geofencing/GeofenceToggle";
import { colors } from "@/constants/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);

  const handleLogout = () => {
    Alert.alert("로그아웃", "로그아웃 하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* 계정 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>계정</Text>
        {user ? (
          <View style={styles.accountCard}>
            <View style={styles.accountInfo}>
              <Text style={styles.accountLabel}>로그인됨</Text>
              <Text style={styles.accountEmail}>{user.email}</Text>
            </View>
            <Pressable style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutButtonText}>로그아웃</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.loginCard} onPress={() => router.push("/login")}>
            <Text style={styles.loginCardText}>로그인 / 회원가입</Text>
            <Text style={styles.loginCardArrow}>›</Text>
          </Pressable>
        )}
      </View>

      {/* 알림 설정 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>알림</Text>
        <GeofenceToggle />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 8 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9f9f9",
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 10,
  },
  accountInfo: { gap: 4 },
  accountLabel: { fontSize: 12, color: "#999" },
  accountEmail: { fontSize: 15, fontWeight: "600", color: "#000" },
  logoutButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  logoutButtonText: { fontSize: 13, color: "#FF3B30", fontWeight: "600" },
  loginCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9f9f9",
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 10,
  },
  loginCardText: { fontSize: 15, fontWeight: "600", color: colors.primary },
  loginCardArrow: { fontSize: 18, color: "#999" },
});
