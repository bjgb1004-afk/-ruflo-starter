import { View, Text, Pressable, StyleSheet, Linking } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { colors } from "@/constants/theme";
import { reportError } from "@/lib/errorLog";
import {
  getUpdateGate,
  installedRuntime,
  PLAY_STORE_URL,
  PLAY_STORE_WEB_URL,
} from "@/features/appUpdate/updateGate";

/**
 * 구버전 껍데기에 갇힌 앱에만 뜨는 전체화면 안내.
 *
 * 이 화면이 필요한 이유: 네이티브 부품이 바뀌면 그 이전 껍데기는 어떤 OTA도 못 받는다.
 * 즉 "업데이트하라"는 말을 나중에 보낼 방법이 없다 - 보낼 수단 자체가 못 가는 쪽에 있다.
 * 그래서 안내를 OTA가 아니라 서버 조회(Supabase)로 가져온다. 앱은 열 때마다 어차피
 * Supabase에 접속하니 표식이 갈라진 폰에서도 이 조회만은 도착한다.
 *
 * 평소에는 서버에 해당 줄이 없어 null을 반환하고 아무것도 그리지 않는다. 네트워크가
 * 끊겨 조회가 실패해도 마찬가지로 아무것도 안 뜬다 - 막는 쪽이 아니라 통과시키는 쪽으로
 * 고장난다.
 */
export function UpdateGate() {
  const runtime = installedRuntime();
  const { data: gate } = useQuery({
    queryKey: ["app-update-gate", runtime],
    queryFn: () => getUpdateGate(runtime as string),
    enabled: runtime !== null,
    // 한 번 뜬 뒤에는 유저가 스토어에서 업데이트하는 것 말고 할 일이 없으니
    // 자주 다시 물을 이유가 없다. 반대로 실수로 넣은 줄을 지웠을 때 너무 오래
    // 남아 있지 않도록 1시간으로 둔다.
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  if (!gate) return null;

  const openStore = () => {
    // market:// 이 열리지 않는 기기(스토어 미설치/사이드로드)에서는 웹 주소로 떨어진다.
    Linking.openURL(PLAY_STORE_URL).catch(() =>
      Linking.openURL(PLAY_STORE_WEB_URL).catch((err) => reportError(err, "update-gate-store")),
    );
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🔄</Text>
        <Text style={styles.title}>{gate.title}</Text>
        <Text style={styles.message}>{gate.message}</Text>
        <Pressable style={styles.button} onPress={openStore} accessibilityRole="button">
          <Text style={styles.buttonLabel}>스토어에서 업데이트</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    // 탭바·스택 헤더까지 덮어야 한다. 아래 화면을 조작할 수 있으면 안내가 아니라
    // 그냥 닫히는 배너가 된다.
    zIndex: 100,
    elevation: 100,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  emoji: { fontSize: 40 },
  title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: "center",
  },
  button: {
    marginTop: 8,
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonLabel: { color: colors.surface, fontSize: 15, fontWeight: "700" },
});
