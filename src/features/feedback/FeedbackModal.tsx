import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors } from "@/constants/theme";
import {
  CONTACT_MAX,
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  submitFeedback,
  type FeedbackKind,
} from "./feedbackApi";

interface Props {
  visible: boolean;
  onClose: () => void;
}

// 설정의 "불편한 점·의견 보내기". 불만이 앱 삭제나 낮은 별점 대신 여기로 들어오게 하는 창구다.
export function FeedbackModal({ visible, onClose }: Props) {
  const [kind, setKind] = useState<FeedbackKind>("불편한 점");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const close = useCallback(() => {
    if (sending) return;
    onClose();
    // 닫힌 뒤에 초기화해 닫히는 애니메이션 중 화면이 깜빡이지 않게 한다.
    setTimeout(() => {
      setKind("불편한 점");
      setMessage("");
      setContact("");
      setError(null);
      setDone(false);
    }, 300);
  }, [onClose, sending]);

  const send = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    const result = await submitFeedback({ kind, message, contact });
    setSending(false);
    if (result.ok) setDone(true);
    else setError(result.error);
  }, [sending, kind, message, contact]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdropTouchable} onPress={close} />
        <View style={styles.card}>
          {done ? (
            <>
              <Text style={styles.title}>보내주셔서 감사합니다</Text>
              <Text style={styles.description}>
                남겨주신 내용은 앱을 고치는 데 참고할게요.
                {contact.trim() ? "" : "\n연락처를 적지 않으셔서 답장은 드리지 못해요."}
              </Text>
              <Pressable style={styles.sendButton} onPress={close}>
                <Text style={styles.sendButtonText}>닫기</Text>
              </Pressable>
            </>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>불편한 점·의견 보내기</Text>
              <Text style={styles.description}>
                앱을 쓰며 불편했던 점이나 바라는 기능을 알려주세요.
              </Text>

              <View style={styles.chipRow}>
                {FEEDBACK_KINDS.map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => setKind(k)}
                    style={[styles.chip, kind === k && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, kind === k && styles.chipTextActive]}>{k}</Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={[styles.input, styles.messageInput]}
                placeholder="내용을 적어주세요 (5자 이상)"
                placeholderTextColor="#999"
                value={message}
                onChangeText={(t) => {
                  setMessage(t.slice(0, FEEDBACK_MAX));
                  if (error) setError(null);
                }}
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.counter}>
                {message.length}/{FEEDBACK_MAX}
              </Text>

              <TextInput
                style={styles.input}
                placeholder="답장 받을 연락처 (선택, 이메일 등)"
                placeholderTextColor="#999"
                value={contact}
                onChangeText={(t) => setContact(t.slice(0, CONTACT_MAX))}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              {error && <Text style={styles.errorText}>{error}</Text>}

              <Pressable
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                onPress={send}
                disabled={sending}
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendButtonText}>보내기</Text>}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  backdropTouchable: { ...StyleSheet.absoluteFillObject },
  card: {
    width: "88%",
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#000", marginBottom: 6 },
  description: { fontSize: 13, color: "#666", lineHeight: 19, marginBottom: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#f2f2f2",
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: "#444", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#000",
    marginBottom: 6,
  },
  messageInput: { minHeight: 110 },
  counter: { fontSize: 11, color: "#aaa", textAlign: "right", marginBottom: 10 },
  errorText: { fontSize: 12, color: "#d33", marginBottom: 8 },
  sendButton: {
    marginTop: 6,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: { opacity: 0.6 },
  sendButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
