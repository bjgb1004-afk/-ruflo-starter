import { useCallback, useMemo } from "react";
import { View, Text, Pressable, StyleSheet, FlatList } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/features/auth/useAuth";
import { ADMIN_EMAILS } from "@/constants/config";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";
import { useResponsive, getResponsiveFontSize } from "@/utils/responsive";

interface MoreMenuItem {
  key: string;
  emoji: string;
  label: string;
  /** 이름만 보고 뭔지 모르는 화면이 있다 - 한 줄 설명을 붙여야 눌러본다. */
  sub?: string;
  href: Href;
}

// 탭바를 없애면서(2026-11-28) 랭킹이 여기로 내려왔다. 홈에 남긴 건 당첨확인·지도 둘뿐이고,
// 나머지 전부가 이 목록이다 - 그래서 이름만 적지 않고 한 줄 설명을 같이 붙인다.
// 지도는 일부러 넣지 않았다. 홈 버튼으로 바로 가는 이 앱의 주력 기능이라 메뉴에 숨기면
// 안 눌린다.
const MENU_ITEMS: MoreMenuItem[] = [
  { key: "ranking", emoji: "🏆", label: "명당 랭킹", sub: "1등 많이 나온 판매점 순위", href: "/ranking" },
  { key: "stats", emoji: "📊", label: "회차별 당첨현황", sub: "지난 회차 골라서 조회", href: "/more/stats" },
  { key: "replay", emoji: "💸", label: "놓친 당첨금", sub: "내 번호로 지난 회차 대입", href: "/replay" },
  { key: "spitto", emoji: "🎫", label: "스피또 현황", sub: "남은 1등 · 지급 마감일", href: "/more/spitto" },
  { key: "favorites", emoji: "⭐", label: "즐겨찾기", sub: "저장해둔 판매점", href: "/more/favorites" },
  { key: "generator", emoji: "🎲", label: "천재들의 한수", sub: "번호 자동 생성 · 보관함에 저장", href: "/more/generator" },
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
        : MENU_ITEMS,
    [isAdmin],
  );

  const renderItem = useCallback(
    ({ item }: { item: MoreMenuItem }) => (
      <Pressable style={styles.row} onPress={() => router.push(item.href)}>
        <Text style={[styles.emoji, { fontSize: getResponsiveFontSize(19, breakpoint) }]}>{item.emoji}</Text>
        <View style={styles.texts}>
          <Text style={[styles.label, { fontSize: getResponsiveFontSize(15, breakpoint) }]}>{item.label}</Text>
          {item.sub && (
            <Text style={[styles.sub, { fontSize: getResponsiveFontSize(11, breakpoint) }]}>{item.sub}</Text>
          )}
        </View>
        <Text style={styles.arrow}>›</Text>
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
        // 카드를 하나씩 띄우지 않고 한 장의 흰 판에 줄을 긋는다 - 일곱 줄을 각각 카드로
        // 만들면 그림자가 일곱 번 겹쳐 목록이 아니라 버튼 더미처럼 보인다.
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: {
    margin: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    ...cardShadow,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  emoji: { width: 26, textAlign: "center" },
  texts: { flex: 1 },
  label: { fontWeight: "700", color: colors.textPrimary },
  sub: { color: colors.textMuted, marginTop: 1 },
  arrow: { fontSize: 18, color: colors.border },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 26 + spacing.md,
  },
});
