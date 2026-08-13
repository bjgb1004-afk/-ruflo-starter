// app/store-owner/manage.tsx
import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/features/auth/useAuth";
import {
  getMyOwnedStores,
  getStoreOwnerProfile,
  updateOwnerProfile,
  type OwnedStoreSummary,
  type StoreOwnerProfileSummary,
} from "@/features/storeOwner/api/storeOwnerApi";
import { colors, spacing, radius } from "@/constants/theme";

export default function StoreOwnerManageScreen() {
  const { storeId: paramStoreId, testMode } = useLocalSearchParams<{ storeId?: string; testMode?: string }>();
  const userId = useAuth((s) => s.user?.id);
  const isTestMode = testMode === "true";

  const [loading, setLoading] = useState(true);
  const [ownedStores, setOwnedStores] = useState<OwnedStoreSummary[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(paramStoreId ?? null);
  const [profile, setProfile] = useState<StoreOwnerProfileSummary | null>(null);

  const [phone, setPhone] = useState("");
  const [businessHours, setBusinessHours] = useState("");
  const [ownerMessage, setOwnerMessage] = useState("");
  const [hasParking, setHasParking] = useState(false);
  const [hasRestroom, setHasRestroom] = useState(false);
  const [hasAtm, setHasAtm] = useState(false);
  const [amenitiesText, setAmenitiesText] = useState(""); // 쉼표로 구분된 자유 태그
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getMyOwnedStores(userId)
      .then(setOwnedStores)
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!activeStoreId) return;
    getStoreOwnerProfile(activeStoreId).then((p) => {
      setProfile(p);
      setPhone(p?.phone ?? "");
      setBusinessHours(p?.business_hours ?? "");
      setOwnerMessage(p?.owner_message ?? "");
      setHasParking(p?.has_parking ?? false);
      setHasRestroom(p?.has_restroom ?? false);
      setHasAtm(p?.has_atm ?? false);
      setAmenitiesText((p?.amenities ?? []).join(", "));
    });
  }, [activeStoreId]);

  const handleSave = useCallback(async () => {
    if (!activeStoreId) return;
    if (ownerMessage.length > 100) {
      Alert.alert("입력 오류", "한마디는 최대 100자까지 입력할 수 있어요.");
      return;
    }
    setSubmitting(true);
    try {
      await updateOwnerProfile(activeStoreId, {
        phone: phone || null,
        business_hours: businessHours || null,
        owner_message: ownerMessage || null,
        has_parking: hasParking,
        has_restroom: hasRestroom,
        has_atm: hasAtm,
        amenities: amenitiesText
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      });
      Alert.alert("저장 완료", "매장 정보가 저장되었습니다.");
    } catch {
      Alert.alert("오류", "저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [activeStoreId, phone, businessHours, ownerMessage, hasParking, hasRestroom, hasAtm, amenitiesText]);

  if (!userId && !isTestMode) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>로그인이 필요합니다.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!activeStoreId) {
    const storesToShow = isTestMode
      ? [
          {
            storeId: "test-store-001",
            name: "[테스트] 로또 판매점",
            address: "서울시 강남구 테헤란로",
          },
        ]
      : ownedStores;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>내 매장 관리</Text>
        {isTestMode && <Text style={styles.emptyText}>테스트 모드: 샘플 매장입니다.</Text>}
        {storesToShow.length === 0 ? (
          <Text style={styles.emptyText}>
            아직 인증된 매장이 없어요. 매장 상세 화면에서 "사장님이신가요?"를 눌러 인증을 신청해보세요.
          </Text>
        ) : (
          storesToShow.map((store) => (
            <Pressable key={store.storeId} style={styles.storeRow} onPress={() => setActiveStoreId(store.storeId)}>
              <Text style={styles.storeRowName}>{store.name}</Text>
              <Text style={styles.storeRowAddress}>{store.address}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>매장 정보 수정</Text>
      {!isTestMode && profile?.owner_user_id !== userId ? (
        <Text style={styles.emptyText}>이 매장의 사장님 권한이 없습니다.</Text>
      ) : (
        <View style={styles.section}>
          <Text style={styles.label}>전화번호</Text>
          <TextInput
            style={styles.input}
            placeholder="02-1234-5678"
            placeholderTextColor="#999"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Text style={styles.label}>영업시간</Text>
          <TextInput
            style={styles.input}
            placeholder="예: 매일 09:00~23:00"
            placeholderTextColor="#999"
            value={businessHours}
            onChangeText={setBusinessHours}
          />
          <Text style={styles.label}>한마디 ({ownerMessage.length}/100)</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            placeholder="손님들께 전하고 싶은 한마디"
            placeholderTextColor="#999"
            multiline
            maxLength={100}
            value={ownerMessage}
            onChangeText={setOwnerMessage}
          />
          <Text style={styles.label}>편의시설</Text>
          <View style={styles.amenityChipRow}>
            <Pressable
              style={[styles.amenityChip, hasParking && styles.amenityChipActive]}
              onPress={() => setHasParking((v) => !v)}
            >
              <Text style={[styles.amenityChipText, hasParking && styles.amenityChipTextActive]}>🅿️ 주차</Text>
            </Pressable>
            <Pressable
              style={[styles.amenityChip, hasRestroom && styles.amenityChipActive]}
              onPress={() => setHasRestroom((v) => !v)}
            >
              <Text style={[styles.amenityChipText, hasRestroom && styles.amenityChipTextActive]}>🚻 화장실</Text>
            </Pressable>
            <Pressable
              style={[styles.amenityChip, hasAtm && styles.amenityChipActive]}
              onPress={() => setHasAtm((v) => !v)}
            >
              <Text style={[styles.amenityChipText, hasAtm && styles.amenityChipTextActive]}>💳 ATM</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            placeholder="기타 편의시설 (쉼표로 구분, 예: 흡연구역, 포토부스)"
            placeholderTextColor="#999"
            value={amenitiesText}
            onChangeText={setAmenitiesText}
          />
          <Pressable style={styles.primaryButton} onPress={handleSave} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>저장</Text>}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  section: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  label: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.textPrimary,
  },
  messageInput: { minHeight: 70, textAlignVertical: "top" },
  amenityChipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  amenityChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
  },
  amenityChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  amenityChipText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  amenityChipTextActive: { color: "#fff" },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  storeRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  storeRowName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  storeRowAddress: { fontSize: 12, color: colors.textSecondary },
});
