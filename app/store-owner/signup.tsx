// app/store-owner/signup.tsx
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/features/auth/useAuth";
import { searchStores, type StoreSearchResult } from "@/features/stores/api/storesApi";
import { verifyStoreOwner } from "@/features/storeOwner/api/storeOwnerApi";
import { colors, spacing, radius } from "@/constants/theme";

export default function StoreOwnerSignupScreen() {
  const router = useRouter();
  const { storeId: prefilledStoreId } = useLocalSearchParams<{ storeId?: string }>();
  const user = useAuth((s) => s.user);
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StoreSearchResult[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreSearchResult | null>(null);

  const [bizName, setBizName] = useState("");
  const [bizRegNumber, setBizRegNumber] = useState("");
  const [repName, setRepName] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefilledStoreId) return;
    // storeId만 있고 이름/주소가 없으면 검색 결과 선택 단계는 스킵하지 않고, 검색창에
    // 미리 채워두는 정도로만 돕는다(정확한 매장 객체는 사용자가 검색·선택해야 함).
  }, [prefilledStoreId]);

  const handleSearch = useCallback(async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await searchStores(text);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
  }, []);

  const handleAuthSubmit = useCallback(
    async (mode: "signup" | "signin") => {
      if (!email || !password) return;
      setAuthSubmitting(true);
      setAuthError(null);
      const { error } = mode === "signup" ? await signUp(email, password) : await signIn(email, password);
      setAuthSubmitting(false);
      if (error) setAuthError(error);
    },
    [email, password, signIn, signUp],
  );

  const rejectReasonText: Record<string, string> = {
    hometax_mismatch: "국세청에 등록된 사업자정보와 일치하지 않습니다. 사업자등록번호/개업일자/대표자명을 다시 확인해주세요.",
    business_closed: "휴업 또는 폐업 상태의 사업자로 확인됩니다.",
    name_mismatch: "입력하신 상호명이 선택하신 매장 정보와 너무 다릅니다. 매장을 다시 선택하거나 상호명을 확인해주세요.",
  };

  const handleVerifySubmit = useCallback(async () => {
    if (!selectedStore || !bizName || !bizRegNumber || !repName || !openDate) return;
    setVerifySubmitting(true);
    setVerifyError(null);
    try {
      const result = await verifyStoreOwner({
        storeId: selectedStore.id,
        bizName,
        bizRegNumber,
        repName,
        openDate,
      });
      if (result.status === "approved" || result.status === "already_owner") {
        Alert.alert("인증 완료", "사장님 인증이 완료되었습니다. 이제 매장 정보를 수정할 수 있어요.", [
          { text: "확인", onPress: () => router.replace(`/store-owner/manage?storeId=${selectedStore.id}`) },
        ]);
      } else if (result.status === "transfer_pending") {
        Alert.alert(
          "인증 통과",
          "인증은 통과했습니다. 기존 사장님의 이의제기가 없으면 7일 후 자동으로 사장님 권한이 부여됩니다.",
          [{ text: "확인", onPress: () => router.back() }],
        );
      } else if (result.status === "rejected") {
        setVerifyError(rejectReasonText[result.reason] ?? "인증에 실패했습니다. 다시 시도해주세요.");
      } else if (result.status === "locked") {
        const unlockTime = new Date(result.unlockAt).toLocaleString("ko-KR");
        setVerifyError(`인증 시도가 너무 많이 실패했습니다. ${unlockTime} 이후 다시 시도해주세요.`);
      }
    } catch {
      setVerifyError("인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setVerifySubmitting(false);
    }
  }, [selectedStore, bizName, bizRegNumber, repName, openDate, router]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>복권 판매점 사장님 인증</Text>
        <Text style={styles.subtitle}>
          사업자 정보를 입력하시면 국세청 확인을 거쳐 매장 정보를 직접 수정하실 수 있어요.
        </Text>

        {!user && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>계정</Text>
            <TextInput
              style={styles.input}
              placeholder="이메일"
              placeholderTextColor="#999"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="비밀번호"
              placeholderTextColor="#999"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {authError && <Text style={styles.errorText}>{authError}</Text>}
            <View style={styles.authButtonRow}>
              <Pressable style={styles.secondaryButton} onPress={() => handleAuthSubmit("signin")} disabled={authSubmitting}>
                <Text style={styles.secondaryButtonText}>이미 계정 있어요</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => handleAuthSubmit("signup")} disabled={authSubmitting}>
                {authSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>처음이에요(가입)</Text>}
              </Pressable>
            </View>
          </View>
        )}

        {user && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>내 매장 찾기</Text>
              {selectedStore ? (
                <View style={styles.selectedStoreCard}>
                  <Text style={styles.selectedStoreName}>{selectedStore.name}</Text>
                  <Text style={styles.selectedStoreAddress}>{selectedStore.address}</Text>
                  <Pressable onPress={() => setSelectedStore(null)}>
                    <Text style={styles.changeStoreText}>다시 검색</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="매장명 또는 주소로 검색"
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={handleSearch}
                  />
                  {searchResults.map((store) => (
                    <Pressable key={store.id} style={styles.searchResultRow} onPress={() => setSelectedStore(store)}>
                      <Text style={styles.searchResultName}>{store.name}</Text>
                      <Text style={styles.searchResultAddress}>{store.address}</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </View>

            {selectedStore && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>사업자 정보</Text>
                <TextInput
                  style={styles.input}
                  placeholder="상호명 (사업자등록증 상 상호)"
                  placeholderTextColor="#999"
                  value={bizName}
                  onChangeText={setBizName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="사업자등록번호 (숫자 10자리)"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  value={bizRegNumber}
                  onChangeText={setBizRegNumber}
                />
                <TextInput
                  style={styles.input}
                  placeholder="대표자명"
                  placeholderTextColor="#999"
                  value={repName}
                  onChangeText={setRepName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="개업일자 (YYYYMMDD, 예: 20210401)"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  value={openDate}
                  onChangeText={setOpenDate}
                />
                {verifyError && <Text style={styles.errorText}>{verifyError}</Text>}
                <Pressable
                  style={styles.primaryButton}
                  onPress={handleVerifySubmit}
                  disabled={verifySubmitting || !bizName || !bizRegNumber || !repName || openDate.length !== 8}
                >
                  {verifySubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>인증 신청</Text>}
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  section: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.textPrimary,
  },
  errorText: { fontSize: 12, color: "#FF3B30" },
  authButtonRow: { flexDirection: "row", gap: spacing.sm },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  selectedStoreCard: { backgroundColor: colors.background, borderRadius: radius.sm, padding: spacing.md, gap: 4 },
  selectedStoreName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  selectedStoreAddress: { fontSize: 12, color: colors.textSecondary },
  changeStoreText: { fontSize: 12, color: colors.primary, marginTop: spacing.xs },
  searchResultRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchResultName: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  searchResultAddress: { fontSize: 12, color: colors.textSecondary },
});
