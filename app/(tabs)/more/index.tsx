import { useCallback, useMemo } from "react";
import { View, Text, Pressable, StyleSheet, FlatList } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/features/auth/useAuth";
import { ADMIN_EMAILS } from "@/constants/config";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";
import { useResponsive, getResponsiveSpacing, getResponsiveFontSize } from "@/utils/responsive";

interface MoreMenuItem {
  key: string;
  emoji: string;
  label: string;
  href: Href;
  // 아직 유저에게 공개하지 않은 메뉴. 공개할 때 이 줄만 지우면 된다.
  adminOnly?: boolean;
}

// 추후 메뉴가 늘어나도 이 배열에 항목만 추가하면 되도록 데이터 기반으로 구성한다.
// QR 당첨확인이 탭으로 나가고, 즐겨찾기가 그 자리로 들어왔다(design.txt 요구사항).
const MENU_ITEMS: MoreMenuItem[] = [
  { key: "generator", emoji: "🎲", label: "천재들의 한수", href: "/more/generator", adminOnly: true },
  { key: "replay", emoji: "⏪", label: "내 번호 리플레이", href: "/replay", adminOnly: true },
  { key: "favorites", emoji: "⭐", label: "즐겨찾기", href: "/more/favorites" },
  { key: "stats", emoji: "📊", label: "회차별 당첨현황", href: "/more/stats" },
  { key: "settings", emoji: "⚙️", label: "앱 설정", href: "/more/settings" },
];

export default function MoreScreen() {
  const router = useRouter();
  const { breakpoint } = useResponsive();
  const userEmail = useAuth((s) => s.user?.email);
  const isAdmin = useMemo(() => !!userEmail && ADMIN_EMAILS.includes(userEmail), [userEmail]);

  const menuItems = useMemo(
    () =>
      isAdmin
        ? [...MENU_ITEMS, { key: "admin", emoji: "🛠️", label: "관리자", href: "/admin" as Href }]
        : MENU_ITEMS.filter((item) => !item.adminOnly),
    [isAdmin],
  );

  const renderItem = useCallback(
    ({ item }: { item: MoreMenuItem }) => (
      <Pressable
        style={[
          styles.row,
          { padding: getResponsiveSpacing(spacing.lg, breakpoint) },
        ]}
        onPress={() => router.push(item.href)}
      >
        <Text style={[styles.emoji, { fontSize: getResponsiveFontSize(20, breakpoint) }]}>
          {item.emoji}
        </Text>
        <Text style={[styles.label, { fontSize: getResponsiveFontSize(15, breakpoint) }]}>
          {item.label}
        </Text>
        <Text style={[styles.arrow, { fontSize: getResponsiveFontSize(18, breakpoint) }]}>›</Text>
      </Pressable>
    ),
    [router, breakpoint],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={menuItems}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...cardShadow,
  },
  emoji: { fontSize: 20 },
  label: { flex: 1, fontWeight: "600", color: colors.textPrimary },
  arrow: { color: colors.textMuted },
});
