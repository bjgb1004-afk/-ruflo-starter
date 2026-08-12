// src/features/storeOwner/components/OwnershipTransferBanner.tsx
import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useMyPendingTransfers } from "../useMyPendingTransfers";
import { disputeOwnershipTransfer } from "../api/storeOwnerApi";
import { daysUntilExpiry } from "../resolveDisplayInfo";
import { colors, spacing, radius } from "@/constants/theme";

export function OwnershipTransferBanner({ storeId }: { storeId: string }) {
  const userId = useAuth((s) => s.user?.id);
  const { data: transfers } = useMyPendingTransfers();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const transfer = transfers?.find((t) => t.store_id === storeId);

  const handleDispute = useCallback(() => {
    if (!transfer) return;
    Alert.alert("이의 제기", "이 매장의 소유권 이전 신청에 이의를 제기하시겠습니까? 관리자가 확인합니다.", [
      { text: "취소", style: "cancel" },
      {
        text: "이의 제기",
        style: "destructive",
        onPress: async () => {
          setSubmitting(true);
          try {
            await disputeOwnershipTransfer(transfer.id);
            queryClient.invalidateQueries({ queryKey: ["store-owner", "pending-transfers"] });
          } catch (err) {
            Alert.alert("오류", "이의 제기에 실패했습니다. 잠시 후 다시 시도해주세요.");
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }, [transfer, queryClient]);

  if (!transfer || !userId) return null;

  const isPreviousOwner = transfer.previous_owner_user_id === userId;
  const daysLeft = daysUntilExpiry(transfer.expires_at);

  let message: string;
  if (transfer.status === "disputed") {
    message = "이의 제기가 접수되어 관리자가 확인 중입니다.";
  } else if (isPreviousOwner) {
    message = `다른 신청자가 이 매장 사장님으로 재신청했습니다. 이의가 없으면 ${daysLeft}일 후 자동으로 소유권이 이전됩니다.`;
  } else {
    message = `인증은 통과했습니다. 기존 사장님의 이의제기가 없으면 ${daysLeft}일 후 자동으로 승인됩니다.`;
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{message}</Text>
      {isPreviousOwner && transfer.status === "pending" && (
        <Pressable style={styles.disputeButton} onPress={handleDispute} disabled={submitting}>
          {submitting ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.disputeButtonText}>이의 제기</Text>}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  text: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  disputeButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
  },
  disputeButtonText: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
});
