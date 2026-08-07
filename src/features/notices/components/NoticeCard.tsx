import { memo, useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLatestNotice } from "@/features/notices/api/noticesApi";

const DISMISSED_KEY = "dismissed_notice_id";

export const NoticeCard = memo(function NoticeCard() {
  const { data: notice } = useQuery({
    queryKey: ["notices", "latest"],
    queryFn: getLatestNotice,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const [dismissedId, setDismissedId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then(setDismissedId);
  }, []);

  const handleDismiss = useCallback(() => {
    if (!notice) return;
    setDismissedId(notice.id);
    AsyncStorage.setItem(DISMISSED_KEY, notice.id);
  }, [notice]);

  // dismissedId === undefined면 아직 AsyncStorage 조회 전이라 깜빡임 방지를 위해 숨김
  if (!notice || dismissedId === undefined || dismissedId === notice.id) return null;

  return (
    <View style={styles.card}>
      <View style={styles.textGroup}>
        <Text style={styles.title}>📢 {notice.title}</Text>
        <Text style={styles.message}>{notice.message}</Text>
      </View>
      <Pressable hitSlop={8} onPress={handleDismiss}>
        <Text style={styles.closeButton}>✕</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: "#EEF6FF",
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  textGroup: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: "700", color: "#0055CC" },
  message: { fontSize: 12, color: "#333" },
  closeButton: { fontSize: 14, color: "#999", paddingHorizontal: 4 },
});
