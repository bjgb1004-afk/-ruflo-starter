import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, Pressable, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { getLatestFirstPrizeWinners } from "@/features/draws/api/drawHistoryApi";
import { getSpittoRounds, sellingRounds, remainingRatio } from "@/features/spitto/api/spittoApi";
import { findClaimDeadlineWarning } from "@/features/spitto/claimDeadline";
import { colors, spacing, radius } from "@/constants/theme";

// 1등 배출 소식과 스피또 소식을 띠 한 자리에서 번갈아 보여준다. 둘 다 "지금 뭐가 있나"를
// 알리는 짧은 한 줄이라 세로로 나란히 쌓아두면 지도가 그만큼 밀려 내려간다 - 한 자리를
// 돌려쓰면 지도가 더 일찍 보인다.
const ROTATE_MS = 4000;
const FADE_MS = 200;

function formatDrawDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function describeRank1(remaining: number, total: number): string {
  return remaining === total ? `1등 ${total}매 모두 남음` : `1등 ${total}매 중 ${remaining}매 남음`;
}

interface BannerItem {
  key: string;
  text: string;
  urgent: boolean;
  onPress: () => void;
}

export const HomeBannerCarousel = memo(function HomeBannerCarousel() {
  const router = useRouter();

  const { data: latestWinners } = useQuery({
    queryKey: ["draws", "latest-winners"],
    queryFn: getLatestFirstPrizeWinners,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: spittoRounds } = useQuery({
    queryKey: ["spitto", "rounds"],
    queryFn: getSpittoRounds,
    staleTime: 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
  });

  const items = useMemo<BannerItem[]>(() => {
    const list: BannerItem[] = [];

    if (latestWinners && latestWinners.stores.length > 0) {
      const [first, ...rest] = latestWinners.stores;
      const label = rest.length > 0 ? `${first.storeName} 외 ${rest.length}곳` : first.storeName;
      list.push({
        key: "winner",
        text: `🎉 ${latestWinners.drawNo}회(${formatDrawDate(latestWinners.drawDate)}) 1등 배출 · ${label}`,
        urgent: false,
        onPress: () => router.push(`/draw/${latestWinners.drawNo}`),
      });
    }

    if (spittoRounds) {
      const expiring = findClaimDeadlineWarning(spittoRounds);
      if (expiring) {
        list.push({
          key: "spitto",
          text: `⏰ 스피또 ${expiring.headline}`,
          urgent: true,
          onPress: () => router.push("/more/spitto"),
        });
      } else {
        const top = sellingRounds(spittoRounds)[0];
        if (top && remainingRatio(top) >= 0) {
          list.push({
            key: "spitto",
            text: `🎟️ ${top.game_name} ${top.round_no}회 · ${describeRank1(top.rank1_remaining as number, top.rank1_total as number)}`,
            urgent: false,
            onPress: () => router.push("/more/spitto"),
          });
        }
      }
    }

    return list;
  }, [latestWinners, spittoRounds, router]);

  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  // 항목 수가 바뀌면(로딩 완료 등) 범위 밖을 가리킬 수 있으니 처음으로 되돌린다.
  useEffect(() => {
    setIndex((i) => (i < items.length ? i : 0));
  }, [items.length]);

  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % items.length);
        Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      });
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [items.length, opacity]);

  const handlePress = useCallback(() => {
    items[index]?.onPress();
  }, [items, index]);

  if (items.length === 0) return null;
  const current = items[index];

  return (
    <Animated.View style={{ opacity }}>
      <Pressable style={[styles.banner, current.urgent && styles.urgent]} onPress={handlePress}>
        <Text style={[styles.text, current.urgent && styles.urgentText]} numberOfLines={1} ellipsizeMode="tail">
          {current.text}
        </Text>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.goldLight,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    // 평소엔 테두리가 없고 urgent일 때만 1px 테두리가 붙으면 그만큼 칸 높이가 바뀌어
    // 아래 지도의 검색창이 번갈아 뜨는 배너마다 조금씩 움직인다 - 항상 투명 테두리를
    // 깔아 두고 urgent일 때 색만 바꾼다.
    borderWidth: 1,
    borderColor: "transparent",
  },
  text: { fontSize: 13, color: colors.primaryDark, fontWeight: "600" },
  urgent: { backgroundColor: colors.sealLight, borderColor: colors.seal },
  urgentText: { color: colors.seal, fontWeight: "700" },
});
