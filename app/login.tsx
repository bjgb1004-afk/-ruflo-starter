import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/features/auth/useAuth";
import { colors } from "@/constants/theme";

export default function LoginScreen() {
  const router = useRouter();
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!email || !password) {
      Alert.alert("입력 필요", "이메일과 비밀번호를 입력해주세요.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("비밀번호 오류", "비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    setSubmitting(true);
    const { error } = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setSubmitting(false);

    if (error) {
      Alert.alert(mode === "signin" ? "로그인 실패" : "회원가입 실패", error);
      return;
    }

    if (mode === "signup") {
      Alert.alert("가입 완료", "이메일 인증 후 로그인해주세요.", [
        { text: "확인", onPress: () => setMode("signin") },
      ]);
      return;
    }

    router.back();
  }, [email, password, mode, signIn, signUp, router]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{mode === "signin" ? "로그인" : "회원가입"}</Text>
        <Text style={styles.subtitle}>
          {mode === "signin" ? "즐겨찾기와 알림 설정을 동기화하려면 로그인하세요." : "이메일로 계정을 만드세요."}
        </Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호 (6자 이상)"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          <Pressable
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{mode === "signin" ? "로그인" : "회원가입"}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.switchModeButton}
            onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            <Text style={styles.switchModeText}>
              {mode === "signin" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 24 },
  title: { fontSize: 28, fontWeight: "700", color: "#000" },
  subtitle: { fontSize: 14, color: "#666" },
  form: { gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#000",
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switchModeButton: { alignItems: "center", paddingVertical: 12 },
  switchModeText: { color: colors.primary, fontSize: 13 },
});
