import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/features/auth/useAuth";
import { GeofenceToggle } from "@/features/geofencing/GeofenceToggle";
import { GEOFENCE_DEBUG_LOG_KEY } from "@/features/geofencing/geofenceTask";
import { ADMIN_EMAILS, PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@/constants/config";
import { colors } from "@/constants/theme";
import { useResponsive, getResponsiveSpacing, getResponsiveFontSize } from "@/utils/responsive";

const SECRET_TAP_COUNT = 5;
// 이 시간 안에 연속으로 눌러야 카운트가 이어진다 - 하루 종일 산발적으로 누른 게 우연히
// 쌓이는 것을 방지한다.
const SECRET_TAP_WINDOW_MS = 2000;

export default function SettingsScreen() {
  const router = useRouter();
  const { breakpoint } = useResponsive();
  const user = useAuth((s) => s.user);
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);

  // 카운트는 useState로 둬서 로직을 명시적으로 추적 가능하게 하고, 매 탭마다 setTimeout으로
  // 리셋 타이머를 다시 예약한다 - 2초 안에 다음 탭이 없으면 자동으로 0으로 되돌아간다.
  // (setTapCount의 prev 클로저에서 사용되므로 필요)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [tapCount, setTapCount] = useState(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [masterKeyModalOpen, setMasterKeyModalOpen] = useState(false);
  const [masterKey, setMasterKey] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [geofenceDebugLog, setGeofenceDebugLog] = useState<string | null>(null);


  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);


  // 지오펜스 알림이 실기기에서 안 뜬다는 신고 조사용 - OS가 백그라운드 태스크를 호출했는지
  // 여부를 화면 진입 시마다 확인한다. 원인 파악되면 이 블록은 제거할 것.
  useEffect(() => {
    AsyncStorage.getItem(GEOFENCE_DEBUG_LOG_KEY).then((raw) => {
      if (!raw) return;
      try {
        const { message, at } = JSON.parse(raw);
        setGeofenceDebugLog(`${at}: ${message}`);
      } catch {
        // 무시
      }
    });
  }, []);


  // 앱 버전 텍스트를 짧은 시간 안에 5번 연속 누르면 관리자 전용 비밀번호 입력창을 띄운다.
  // 일반 사용자에게는 로그인/회원가입 진입점 자체가 보이지 않는다.
  const handleVersionTap = useCallback(() => {
    setTapCount((prev) => {
      const next = prev + 1;
      if (next >= SECRET_TAP_COUNT) {
        setAuthError(null);
        setMasterKey("");
        setMasterKeyModalOpen(true);
        return 0;
      }
      return next;
    });

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setTapCount(0);
    }, SECRET_TAP_WINDOW_MS);
  }, []);

  const handleMasterKeySubmit = useCallback(async () => {
    if (!masterKey) return;
    setSubmitting(true);
    setAuthError(null);
    // "Master Key"는 별도의 하드코딩된 비밀이 아니라 관리자 본인 Supabase 계정의 실제
    // 비밀번호다 - 서버(Supabase Auth + is_admin() RLS)가 실제로 검증하도록 하기 위함이며,
    // 클라이언트에만 존재하는 비밀번호 비교는 번들을 열어보면 그대로 노출되어 안전하지 않다.
    const { error: signInError } = await signIn(ADMIN_EMAILS[0], masterKey);

    if (!signInError) {
      setSubmitting(false);
      setMasterKeyModalOpen(false);
      setMasterKey("");
      router.push("/admin");
      return;
    }

    // 로그인 실패 - "비밀번호가 틀림"과 "계정이 아직 없음(최초 1회)"을 Supabase 로그인 에러
    // 메시지만으로는 구분할 수 없다(보안상 일부러 같은 메시지를 준다). signUp을 시도해보면
    // 확실히 구분된다: 이미 가입된 이메일이면 signUp이 실패(=원래도 계정 있었음, 비번이 틀림),
    // 처음 보는 이메일이면 signUp이 성공(=계정을 이번에 새로 만듦, 최초 부트스트랩).
    const { error: signUpError } = await signUp(ADMIN_EMAILS[0], masterKey);

    if (signUpError) {
      setSubmitting(false);
      // "이미 가입된 이메일" 계열 오류일 때만 "비밀번호 틀림"으로 안내한다. 그 외(가입 시도
      // 자체가 막힌 경우 - 이메일 전송 한도 초과, 비밀번호 형식 등)는 원인을 그대로 보여줘야
      // "비밀번호가 맞는데도 계속 틀렸다고 나온다"는 혼란을 막을 수 있다.
      const isAlreadyRegistered = /already registered|already exists|already in use/i.test(signUpError);
      setAuthError(isAlreadyRegistered ? "비밀번호가 올바르지 않습니다." : signUpError);
      setTapCount(0);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      return;
    }

    // 계정이 방금 새로 만들어졌다. 이메일 인증이 꺼져있는 프로젝트라면 가입과 동시에 로그인
    // 가능하므로 바로 재시도해본다 - 켜져있다면 아래 재로그인이 실패하고 안내 문구를 보여준다.
    const { error: retrySignInError } = await signIn(ADMIN_EMAILS[0], masterKey);
    setSubmitting(false);

    if (!retrySignInError) {
      setMasterKeyModalOpen(false);
      setMasterKey("");
      router.push("/admin");
      return;
    }

    setAuthError("계정이 생성됐어요. 이메일의 인증 링크를 확인한 뒤 다시 시도해 주세요.");
    setTapCount(0);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, [masterKey, signIn, signUp, router]);

  const appVersion = Constants.expoConfig?.version ?? "0.0.0";

  return (
    <View style={styles.container}>
      {/* 알림 설정 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: getResponsiveFontSize(13, breakpoint) }]}>
          알림
        </Text>
        <GeofenceToggle />
        {geofenceDebugLog && (
          <Text style={[styles.debugText, { fontSize: getResponsiveFontSize(10, breakpoint) }]}>
            {geofenceDebugLog}
          </Text>
        )}
      </View>



      {/* 관리자 빠른 진입 - settings.tsx에서만 보임 */}
      {user?.email && ADMIN_EMAILS.includes(user.email) && (
        <View style={styles.section}>
          <Pressable style={styles.linkRow} onPress={() => router.push("/admin")}>
            <Text style={[styles.linkRowText, { fontSize: getResponsiveFontSize(14, breakpoint) }]}>
              👨‍💼 관리자 대시보드
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: getResponsiveFontSize(13, breakpoint) }]}>
          정보
        </Text>
        <Pressable
          style={styles.linkRow}
          onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
        >
          <Text style={styles.linkRowText}>개인정보처리방침</Text>
        </Pressable>
        <Pressable
          style={styles.linkRow}
          onPress={() => WebBrowser.openBrowserAsync(TERMS_OF_SERVICE_URL)}
        >
          <Text style={styles.linkRowText}>이용약관</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={handleVersionTap} hitSlop={12}>
          <Text style={styles.versionText}>v{appVersion}</Text>
        </Pressable>
      </View>

      <Modal
        visible={masterKeyModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMasterKeyModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalBackdropTouchable} onPress={() => setMasterKeyModalOpen(false)} />
          <View style={[styles.modalCard, { padding: getResponsiveSpacing(20, breakpoint) }]}>
            <Text style={[styles.modalTitle, { fontSize: getResponsiveFontSize(16, breakpoint) }]}>
              관리자 인증
            </Text>
            <TextInput
              style={[styles.modalInput, { fontSize: getResponsiveFontSize(15, breakpoint) }]}
              placeholder="비밀번호"
              placeholderTextColor="#999"
              value={masterKey}
              onChangeText={(text) => {
                setMasterKey(text);
                if (authError) setAuthError(null);
              }}
              secureTextEntry
              autoFocus
              onSubmitEditing={handleMasterKeySubmit}
            />
            {authError && (
              <Text style={[styles.modalErrorText, { fontSize: getResponsiveFontSize(12, breakpoint) }]}>
                {authError}
              </Text>
            )}
            <Pressable
              style={[styles.modalSubmitButton, submitting && styles.modalSubmitButtonDisabled]}
              onPress={handleMasterKeySubmit}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSubmitButtonText}>확인</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 8 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontWeight: "600",
    color: "#999",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  linkRow: {
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
  },
  linkRowText: { fontWeight: "600", color: "#000" },
  debugText: { color: "#bbb", marginHorizontal: 16, marginTop: 6 },
  footer: { alignItems: "center", paddingVertical: 32 },
  versionText: { fontSize: 12, color: "#ccc" },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  modalBackdropTouchable: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    width: 280,
    backgroundColor: "#fff",
    borderRadius: 12,
    gap: 12,
  },
  modalTitle: { fontWeight: "700", color: "#000", textAlign: "center" },
  modalDescription: { color: "#666", textAlign: "center", lineHeight: 19 },
  modalErrorText: { color: "#FF3B30", textAlign: "center" },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#000",
  },
  modalSubmitButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalSubmitButtonDisabled: { opacity: 0.6 },
  modalSubmitButtonText: { color: "#fff", fontWeight: "600" },
});
