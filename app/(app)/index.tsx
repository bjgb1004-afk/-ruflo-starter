import { useCallback, useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { LottoBall } from "@/components/LottoBall";
import { getDrawWinnersDetail, getLatestDraw } from "@/features/draws/api/drawHistoryApi";
import { useDrawsByNo } from "@/features/draws/useDrawsByNo";
import { VaultDrawCard } from "@/features/mylotto/components/VaultDrawCard";
import { computeHomeResult, nextDrawLabel, type HomeResult } from "@/features/mylotto/homeResult";
import { groupTicketsByDraw, type TicketGroup } from "@/features/mylotto/groupTickets";
import { useMyLottoTickets } from "@/features/mylotto/useMyLottoTickets";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

// 홈에 미리 보여줄 회차 수. 전부 펼치면 보관함 화면(/mylotto)과 같아져서 홈이 끝없이 길어진다.
const VAULT_PREVIEW_GROUPS = 2;

/**
 * 먹색 띠에 적을 두 줄. isAmount일 때만 금액용 큰 숫자 글씨를 쓴다 - 당첨금이 아닌 문장을
 * 34px로 쓰면 줄이 넘쳐 두 줄이 되고 띠 높이가 화면마다 달라진다.
 */
function heroLines(result: HomeResult): { tag: string; headline: string; isAmount: boolean } {
  switch (result.kind) {
    case "won":
      return {
        tag: `🎉 ${result.rank}등 ${result.count}장 당첨`,
        headline: `${result.totalPrize.toLocaleString()}원`,
        isAmount: true,
      };
    case "lost":
      return { tag: `${result.count}장 확인 완료`, headline: "아쉽지만 이번엔 낙첨", isAmount: false };
    case "checking":
      return { tag: `${result.count}장 대조 중`, headline: "결과를 맞춰보고 있어요", isAmount: false };
    case "waiting":
      return {
        tag: `${result.drawNo}회 ${result.count}장 저장됨`,
        headline: "추첨을 기다려요",
        isAmount: false,
      };
    case "none":
      return { tag: "저장된 내 번호 없음", headline: "QR을 찍어 확인하세요", isAmount: false };
  }
}

/**
 * 첫 화면. 앱을 켜는 이유 1번("내가 됐나?")의 답을 맨 위 가장 큰 글씨로 먼저 답하고,
 * 그 다음에 할 일(QR 찍기 / 명당 찾기)과 보관함 미리보기를 둔다.
 *
 * 예전 첫 화면은 카메라(당첨확인)였다 - 결과를 보려면 용지를 들고 와야 했고, 이미 찍어둔
 * 사람에게도 "내 결과"를 보여주는 자리가 앱 어디에도 없었다(2026-11-27 경쟁앱 비교).
 */
export default function HomeScreen() {
  const router = useRouter();
  const {
    data: draw,
    isError,
    refetch,
  } = useQuery({
    // 당첨확인 화면 띠(LatestDrawBand)·회차별 당첨현황과 같은 키라 캐시를 공유한다.
    queryKey: ["draws", "latest"],
    queryFn: getLatestDraw,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    // 전역 기본값은 꺼져 있다(RN엔 브라우저 탭 포커스가 없어서) - 그런데 "내가 됐나?"를
    // 답하는 이 화면만큼은 추첨 직후 앱을 다시 열었을 때 캐시가 stale하면 자동으로
    // 새로고침돼야 한다. _layout.tsx의 AppState→focusManager 연결이 있어야 돈다.
    refetchOnWindowFocus: true,
  });

  const ticketsMap = useMyLottoTickets((s) => s.tickets);
  const removeTicket = useMyLottoTickets((s) => s.removeTicket);
  const tickets = useMemo(() => Object.values(ticketsMap), [ticketsMap]);

  const lines = useMemo(
    () => (draw ? heroLines(computeHomeResult(tickets, draw.draw_no)) : null),
    [tickets, draw],
  );

  // 당첨금·당첨자 수는 draw(["draws","latest"])에 이미 들어 있어 추가 호출이 필요 없다.
  // 구매방식(자동/수동/반자동)만 배출점 상세 쪽에 있어 별도로 받는다 - stats 화면의
  // RecentDrawSummary와 같은 쿼리키라 거기서 먼저 열어봤으면 캐시를 그대로 쓴다.
  const { data: winnersDetail } = useQuery({
    queryKey: ["draws", draw?.draw_no, "winners-detail"],
    queryFn: () => getDrawWinnersDetail(draw!.draw_no),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!draw,
  });
  const purchaseTypeSummary = winnersDetail?.purchaseTypeSummary;

  const previewGroups = useMemo(() => groupTicketsByDraw(tickets).slice(0, VAULT_PREVIEW_GROUPS), [tickets]);
  const previewDrawNos = useMemo(() => previewGroups.map((g) => g.drawNo), [previewGroups]);
  const drawsByNo = useDrawsByNo(previewDrawNos);

  // 되돌릴 수 없으니 확인 알럿을 거친다 - scan.tsx·mylotto.tsx의 회차별 삭제와 같은 방식.
  const handleDeleteGroup = useCallback(
    (group: TicketGroup) => {
      Alert.alert("보관함에서 삭제", `${group.drawNo}회 ${group.tickets.length}게임을 삭제할까요?`, [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: "destructive", onPress: () => group.tickets.forEach((t) => removeTicket(t.id)) },
      ]);
    },
    [removeTicket],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.hero}>
        {isError ? (
          <Pressable onPress={() => refetch()} style={styles.heroErrorBox}>
            <Text style={styles.heroErrorText}>당첨번호를 불러오지 못했어요 · 눌러서 다시 시도</Text>
          </Pressable>
        ) : !draw || !lines ? (
          // 로딩 중엔 자리만 비워둔다. 스켈레톤을 깜빡이면 캐시가 있는 경우(대부분)에
          // 화면이 괜히 한 번 덜컹거린다.
          <View style={styles.heroPlaceholder} />
        ) : (
          <>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroDrawNo}>{draw.draw_no}회 결과</Text>
              <Text style={styles.heroDate}>{draw.draw_date} 추첨</Text>
            </View>
            <View style={styles.heroResult}>
              <Text style={[styles.heroTag, lines.isAmount && styles.heroTagWin]}>{lines.tag}</Text>
              <Text style={lines.isAmount ? styles.heroAmount : styles.heroHeadline}>{lines.headline}</Text>
              <Text style={styles.heroNext}>{nextDrawLabel(draw.draw_date, draw.draw_no)}</Text>
            </View>
            <Pressable style={styles.heroNumbers} onPress={() => router.push("/more/stats")}>
              <Text style={styles.heroNumbersLabel}>당첨번호</Text>
              <View style={styles.heroBalls}>
                {draw.winning_numbers.map((n) => (
                  <LottoBall key={n} number={n} size="small" />
                ))}
                <Text style={styles.heroPlus}>+</Text>
                <LottoBall number={draw.bonus_number} isBonus size="small" />
              </View>
            </Pressable>

            {/* 추첨 직후엔 당첨번호는 먼저 뜨고 당첨금 집계는 몇 분~몇십 분 뒤에 붙는다
                (RecentDrawSummary와 같은 패턴) - 그 틈엔 "집계 중"으로 보여준다. */}
            <Pressable style={styles.heroPrizeSummary} onPress={() => router.push("/more/stats")}>
              <Text style={styles.heroPrizeText}>
                {draw.first_prize_winner_count !== null && draw.first_prize_amount_per_win !== null
                  ? `1등 ${draw.first_prize_winner_count}명 · 1인당 ${draw.first_prize_amount_per_win.toLocaleString()}원`
                  : "1등 당첨금 집계 중..."}
              </Text>
              {purchaseTypeSummary &&
                (purchaseTypeSummary.자동 > 0 || purchaseTypeSummary.수동 > 0 || purchaseTypeSummary.반자동 > 0) && (
                  <Text style={styles.heroPrizeMethodText}>
                    구매방식(확인분) 자동 {purchaseTypeSummary.자동} · 수동 {purchaseTypeSummary.수동}
                    {purchaseTypeSummary.반자동 > 0 ? ` · 반자동 ${purchaseTypeSummary.반자동}` : ""}
                  </Text>
                )}
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.body}>
        <Pressable style={styles.scanButton} onPress={() => router.push("/scan")}>
          <Text style={styles.scanButtonIcon}>📷</Text>
          <Text style={styles.scanButtonText}>QR로 당첨확인</Text>
        </Pressable>

        <Pressable style={styles.mapCard} onPress={() => router.push("/map")}>
          <Text style={styles.mapCardIcon}>🗺️</Text>
          <View style={styles.mapCardTexts}>
            <Text style={styles.mapCardTitle}>내 주변 명당</Text>
            <Text style={styles.mapCardSub}>1등 나온 판매점 지도로 보기</Text>
          </View>
          <Text style={styles.mapCardArrow}>›</Text>
        </Pressable>

        <View style={styles.vaultHeader}>
          <Text style={styles.vaultTitle}>🎟️ 내 복권 보관함</Text>
          <Pressable hitSlop={8} onPress={() => router.push("/mylotto")}>
            <Text style={styles.vaultMore}>전체보기 ›</Text>
          </Pressable>
        </View>

        {previewGroups.length === 0 ? (
          <View style={styles.vaultEmpty}>
            <Text style={styles.vaultEmptyText}>QR을 찍으면 여기에 쌓여요</Text>
          </View>
        ) : (
          previewGroups.map((group) => (
            <VaultDrawCard
              key={`draw-${group.drawNo}`}
              drawNo={group.drawNo}
              tickets={group.tickets}
              draw={drawsByNo.get(group.drawNo)}
              onDelete={() => handleDeleteGroup(group)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: spacing.xl },

  // 헤더와 같은 종이색이라 이어 붙어 한 덩어리로 보인다. 색이 같으니 모서리를 둥글릴
  // 이유가 없고, 대신 아래 버튼 영역과 갈라지도록 밑줄 한 줄만 긋는다.
  hero: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  heroPlaceholder: { height: 170 },
  heroErrorBox: { paddingVertical: spacing.xl },
  heroErrorText: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroDrawNo: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  heroDate: { color: colors.textMuted, fontSize: 11 },
  heroResult: { gap: spacing.xs },
  heroTag: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  // 당첨일 때만 금색. goldBright(#E7B94D)는 종이색 위에서 거의 안 읽혀서 진한 금색을 쓴다.
  heroTagWin: { color: colors.primary },
  heroAmount: { color: colors.textPrimary, fontSize: 34, fontWeight: "800", fontFamily: numericFont.bold },
  heroHeadline: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  heroNext: { color: colors.textMuted, fontSize: 11 },
  heroNumbers: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  heroNumbersLabel: { color: colors.textMuted, fontSize: 10 },
  heroBalls: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroPlus: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  heroPrizeSummary: { gap: 3 },
  heroPrizeText: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  heroPrizeMethodText: { color: colors.textSecondary, fontSize: 13 },

  body: { padding: spacing.lg, gap: spacing.md },

  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 62,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    ...cardShadow,
  },
  scanButtonIcon: { fontSize: 22 },
  scanButtonText: { color: "#fff", fontSize: 18, fontWeight: "800" },

  mapCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    height: 62,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  mapCardIcon: { fontSize: 22 },
  mapCardTexts: { flex: 1 },
  mapCardTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  mapCardSub: { fontSize: 11, color: colors.textMuted },
  mapCardArrow: { fontSize: 18, fontWeight: "700", color: colors.primary },

  vaultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
  },
  vaultTitle: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  vaultMore: { fontSize: 11, fontWeight: "700", color: colors.primary },
  vaultEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  vaultEmptyText: { fontSize: 13, color: colors.textMuted },
});
