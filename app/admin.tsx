import { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { getAdminOverview, getDisputedTransfers, resolveDisputedTransfer } from "@/features/admin/api/adminApi";
import { ADMIN_EMAILS } from "@/constants/config";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

function formatDrawDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

// 최신 회차가 이번 주 토요일 추첨 기준으로 너무 오래됐으면(8일 이상) 자동 수집 파이프라인이
// 멈췄을 가능성이 높다는 신호로 보고 경고 색으로 표시한다.
function isDrawStale(dateStr: string): boolean {
  const d = new Date(dateStr);
  const daysSince = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 8;
}

export default function AdminScreen() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const isAdmin = useMemo(() => !!user?.email && ADMIN_EMAILS.includes(user.email), [user?.email]);
  // 안드로이드 엣지투엣지에서 스크롤 맨 아래 내용이 시스템 네비게이션 바에 가려지는
  // 문제 - 앱 전체 점검(design.txt) 결과 이 화면도 해당돼 하단 안전영역 여백을 더한다.
  const insets = useSafeAreaInsets();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: getAdminOverview,
    enabled: isAdmin,
    staleTime: 60 * 1000,
  });

  const queryClient = useQueryClient();
  const { data: disputedTransfers } = useQuery({
    queryKey: ["admin", "disputed-transfers"],
    queryFn: getDisputedTransfers,
    enabled: isAdmin,
    staleTime: 30 * 1000,
  });

  const handleResolve = useCallback(
    async (requestId: string, approve: boolean) => {
      await resolveDisputedTransfer(requestId, approve);
      queryClient.invalidateQueries({ queryKey: ["admin", "disputed-transfers"] });
    },
    [queryClient],
  );

  // 일반적으로 이 화면은 설정 탭의 숨겨진 제스처(버전 텍스트 5회 탭 → 비밀번호 입력)를 통해서만
  // 도달하며, 그 흐름이 로그인까지 함께 처리하므로 여기 도달한 시점엔 이미 로그인되어 있어야
  // 한다. 그래도 딥링크 등으로 직접 진입하는 경우에 대비해 방어적으로 처리한다.
  if (!user || !isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.deniedText}>접근 권한이 없습니다.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.deniedText}>데이터를 불러오지 못했습니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>데이터 업데이트 상태</Text>
        {data.latestDrawNo ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>최신 회차</Text>
            <Text
              style={[
                styles.rowValue,
                data.latestDrawDate && isDrawStale(data.latestDrawDate) && styles.rowValueWarn,
              ]}
            >
              {data.latestDrawNo}회 ({data.latestDrawDate ? formatDrawDate(data.latestDrawDate) : "-"})
              {data.latestDrawDate && isDrawStale(data.latestDrawDate) ? " ⚠️ 갱신 지연 의심" : ""}
            </Text>
          </View>
        ) : (
          <Text style={styles.rowValueWarn}>회차 데이터 없음</Text>
        )}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>전체 판매점</Text>
          <Text style={styles.rowValue}>{data.totalStores.toLocaleString()}개</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>랭킹 집계 판매점</Text>
          <Text style={styles.rowValue}>{data.totalRankedStores.toLocaleString()}개</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>사용자</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>가입자 수</Text>
          <Text style={styles.rowValue}>{data.userCount.toLocaleString()}명</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>최근 7일 오류 (기능별)</Text>
        {data.errorsByFeature.length === 0 ? (
          <Text style={styles.emptyText}>최근 7일간 기록된 오류가 없습니다.</Text>
        ) : (
          data.errorsByFeature.map((item) => (
            <View key={item.feature} style={styles.row}>
              <Text style={styles.rowLabel}>{item.feature}</Text>
              <Text style={styles.rowValue}>{item.count}건</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>소유권 이전 이의제기</Text>
        {!disputedTransfers || disputedTransfers.length === 0 ? (
          <Text style={styles.emptyText}>대기 중인 이의제기가 없습니다.</Text>
        ) : (
          disputedTransfers.map((t) => (
            <View key={t.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{t.store_name}</Text>
                <Text style={styles.rowValue}>{t.previous_owner_email} → {t.new_owner_email}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => handleResolve(t.id, false)}>
                  <Text style={{ color: "#FF3B30", fontWeight: "700" }}>거절</Text>
                </Pressable>
                <Pressable onPress={() => handleResolve(t.id, true)}>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>승인</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>테스트: 사업자 기능</Text>
        <Text style={styles.emptyText}>관리자용 사업자 기능을 테스트합니다.</Text>
        <Pressable
          style={[styles.testButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/store-owner/signup")}
        >
          <Text style={styles.testButtonText}>인증 페이지 보기</Text>
        </Pressable>
        <Pressable
          style={[styles.testButton, { backgroundColor: colors.primary, marginTop: 8 }]}
          onPress={() => router.push("/store-owner/manage?testMode=true")}
        >
          <Text style={styles.testButtonText}>관리 페이지 보기</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  deniedText: { fontSize: 15, color: colors.textMuted },
  section: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs + 2,
  },
  rowLabel: { fontSize: 13, color: colors.textSecondary },
  rowValue: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, fontFamily: numericFont.medium },
  rowValueWarn: { color: colors.orange },
  emptyText: { fontSize: 13, color: colors.textMuted },
  testButton: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  testButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
