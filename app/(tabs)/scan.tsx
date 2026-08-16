import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { reportError } from "@/lib/errorLog";
import { LottoBall } from "@/components/LottoBall";
import { getDrawByNo } from "@/features/draws/api/drawHistoryApi";
import { parseLottoQr, type ParsedLottoGame } from "@/features/qr/parseLottoQr";
import { computeWinRank, getPrizeAmount, type WinRank } from "@/features/qr/checkWinnings";
import { useMyLottoTickets, LOTTO_UNIT_PRICE, type MyLottoTicket } from "@/features/mylotto/useMyLottoTickets";
import { scheduleDrawReminder } from "@/features/mylotto/drawReminders";
import { registerResultPushSubscription } from "@/features/mylotto/pushSubscription";
import { colors, spacing, radius, cardShadow, numericFont } from "@/constants/theme";

// 같은 용지를 계속 카메라에 비추고 있을 때 Bottom Sheet를 닫자마자 동일 QR이
// 즉시 재인식되어 다시 열리는 "깜빡임"을 막기 위한 잠금 해제 지연 시간.
const RESCAN_LOCK_MS = 1500;
// 저장 버튼을 누르면 "저장됨 ✓"을 잠깐 보여준 뒤 자동으로 시트를 닫는다 - 예전엔 저장 후
// "닫고 다음 QR 스캔"을 한 번 더 눌러야 해서 여러 장을 연달아 찍을 때 불편했다.
const AUTO_CLOSE_AFTER_SAVE_MS = 600;

type GameResult = ParsedLottoGame & { rank: WinRank; prizeAmount: number; amountPending: boolean };

type ScanResult =
  | {
      status: "ok";
      drawNo: number;
      drawDate: string;
      winningNumbers: number[];
      bonusNumber: number;
      sourceUrl: string;
      games: GameResult[];
    }
  // 추첨 전(구매 직후)에 스캔한 경우 - 정상적인 사용 흐름이라 에러가 아니라 "저장하고 기다리기"를 안내한다.
  | { status: "pending"; drawNo: number; games: ParsedLottoGame[] }
  | { status: "unrecognized" }
  | { status: "error" };

const RANK_LABEL: Record<Exclude<WinRank, null>, string> = {
  1: "1등",
  2: "2등",
  3: "3등",
  4: "4등",
  5: "5등",
};

// 회차별로 게임 그룹화
function groupTicketsByDraw(tickets: MyLottoTicket[]): Map<number, MyLottoTicket[]> {
  const map = new Map<number, MyLottoTicket[]>();
  tickets.forEach((ticket) => {
    if (!map.has(ticket.drawNo)) map.set(ticket.drawNo, []);
    map.get(ticket.drawNo)!.push(ticket);
  });
  return map;
}

// 회차별 카드 컴포넌트
function VaultDrawCard({ drawNo, tickets }: { drawNo: number; tickets: MyLottoTicket[] }) {
  return (
    <View style={styles.vaultCard}>
      <Text style={styles.vaultCardTitle}>{drawNo}회</Text>
      {tickets.map((ticket, idx) => (
        <View key={ticket.id} style={styles.vaultCardGame}>
          <Text style={styles.vaultCardGameIndex}>{String.fromCharCode(97 + idx)}</Text>
          <View style={styles.vaultCardBalls}>
            {ticket.numbers.map((n) => (
              <LottoBall key={n} number={n} size="xs" />
            ))}
          </View>
          <View style={[styles.vaultCardBadge, ticket.checked ? (ticket.rank ? styles.vaultCardBadgeWin : styles.vaultCardBadgeLose) : styles.vaultCardBadgePending]}>
            <Text style={styles.vaultCardBadgeText}>
              {ticket.checked ? (ticket.rank ? RANK_LABEL[ticket.rank] : "낙첨") : "추첨 전"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const addTickets = useMyLottoTickets((s) => s.addTickets);
  // 화면을 카메라(상단)/보관함(하단) 2분할로 나누고, 저장한 순간 하단 목록이 실시간으로
  // 갱신되는 걸 보여준다 - "찍을 때마다 보관함으로 이동"을 매번 화면 전환 없이도 체감하게
  // 하면서, 화면 전환이 없어야 가능한 "용지 여러 장 연속 스캔" 흐름은 그대로 유지한다.
  const ticketsMap = useMyLottoTickets((s) => s.tickets);
  const recentTickets = useMemo(
    () =>
      Object.values(ticketsMap)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .slice(0, 5),
    [ticketsMap],
  );

  const handleCameraMountError = useCallback((event: { message: string }) => {
    reportError(new Error(`camera mount error: ${event.message}`), "qr-scan-camera");
    setCameraError(true);
  }, []);
  // Expo Router(Stack)는 다른 화면으로 이동해도 이 화면을 언마운트하지 않고 메모리에 남겨둘 수
  // 있어, active 없이 두면 카메라가 백그라운드에서 계속 켜진 채로 배터리/발열 문제가 생긴다.
  // 포커스를 잃으면 CameraView의 active를 꺼서 실제 카메라 리소스를 확실히 해제한다.
  const isFocused = useIsFocused();

  // active={false}만으로 카메라 세션이 끊겨도 일부 기기에서는 torch(LED)가 카메라 파이프라인과
  // 완전히 동기화되지 않아 꺼지지 않을 수 있다. 또한 torchOn을 그대로 두면 나중에 이 화면으로
  // 돌아왔을 때 active가 다시 true가 되면서 사용자가 누르지 않았는데도 손전등이 자동으로 다시
  // 켜지는 문제가 생긴다 - 화면을 벗어나는 시점에 명시적으로 꺼서 두 문제를 함께 방지한다.
  useEffect(() => {
    if (!isFocused) setTorchOn(false);
  }, [isFocused]);

  // 결과 처리 중(파싱→DB조회→표시)에는 카메라 이벤트를 무시해 중복 스캔/중복 API 요청을 막는다.
  // Bottom Sheet가 열려있는 동안도 이 플래그가 true로 유지되어 추가 스캔 이벤트를 차단한다.
  const scanLockRef = useRef(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, []);

  const handleBarcodeScanned = useCallback(async (scan: BarcodeScanningResult) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    setSaveState("idle");

    const parsed = parseLottoQr(scan.data);
    if (!parsed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setResult({ status: "unrecognized" });
      return;
    }

    try {
      const draw = await getDrawByNo(parsed.drawNo);
      if (!draw) {
        // 아직 추첨하지 않은 회차(구매 직후 스캔)일 가능성이 가장 크다 - 에러가 아니라
        // "보관함에 저장하고 추첨일에 알림받기" 흐름으로 안내한다.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setResult({ status: "pending", drawNo: parsed.drawNo, games: parsed.games });
        return;
      }
      // 1~3등은 회차별 변동(파리뮤추얼) 금액이라 추첨 직후(토 20:35~21:10경)엔 당첨번호만
      // 먼저 채워지고 금액 집계가 비어있을 수 있다(useAutoCheckTickets.ts, 서버 알림 스크립트와
      // 동일 이유). 이 경우 여기서 바로 "0원"으로 확정 저장하면 checked=true로 영구 고정되어
      // 나중에 실제 금액이 채워져도 다시는 재검사되지 않는다 - amountPending으로 표시해
      // handleSaveToVault가 checked:false로 저장하게 한다.
      const games: GameResult[] = parsed.games.map((g) => {
        const rank = computeWinRank(g.numbers, draw.winning_numbers, draw.bonus_number);
        const amountByRank: Partial<Record<1 | 2 | 3, number | null>> = {
          1: draw.first_prize_amount_per_win,
          2: draw.second_prize_amount_per_win,
          3: draw.third_prize_amount_per_win,
        };
        const amountPending = (rank === 1 || rank === 2 || rank === 3) && amountByRank[rank] === null;
        return {
          ...g,
          rank,
          amountPending,
          prizeAmount: amountPending
            ? 0
            : getPrizeAmount(
                rank,
                draw.first_prize_amount_per_win,
                draw.second_prize_amount_per_win,
                draw.third_prize_amount_per_win,
              ),
        };
      });
      // QR 스캔 자체가 성공적으로 완료됐다는 것을 화면을 보지 않고도 알 수 있도록 진동을 준다
      // (당첨 여부와 무관하게 "스캔이 인식됐다"는 신호).
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult({
        status: "ok",
        drawNo: draw.draw_no,
        drawDate: draw.draw_date,
        winningNumbers: draw.winning_numbers,
        bonusNumber: draw.bonus_number,
        sourceUrl: scan.data,
        games,
      });
    } catch (err) {
      // QR 자체는 정상 파싱됐는데 네트워크/DB 조회가 실패한 경우다. "인식할 수 없는 QR"이라고
      // 하면 사용자가 용지를 의심하게 되므로, 원인이 다른 별도 상태로 구분해 안내한다.
      reportError(err, "qr-scan-lookup");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setResult({ status: "error" });
    }
  }, []);

  const handleCloseSheet = useCallback(() => {
    setResult(null);
    // 카메라는 계속 유지하되, 방금 닫은 용지가 여전히 프레임 안에 있으면 바로 재인식되어
    // 같은 결과 시트가 다시 뜨는 깜빡임이 생긴다. 일정 시간 뒤에만 잠금을 풀어 방지한다.
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      scanLockRef.current = false;
    }, RESCAN_LOCK_MS);
  }, []);

  const handleSaveToVault = useCallback(() => {
    if (!result || (result.status !== "ok" && result.status !== "pending")) return;
    setSaveState("saving");

    if (result.status === "ok") {
      addTickets(
        result.games.map((g) =>
          g.amountPending
            ? { drawNo: result.drawNo, numbers: g.numbers, purchaseType: g.type }
            : { drawNo: result.drawNo, numbers: g.numbers, purchaseType: g.type, checked: true, rank: g.rank, prizeAmount: g.prizeAmount },
        ),
      );
      // 금액 집계가 아직 안 끝난 게임이 있으면(1~3등 파리뮤추얼 금액 null), 다음 보관함
      // 방문 때 재검사되긴 하지만 그새 앱을 안 열 수도 있으니 결과가 확정되면 푸시로도 알려준다.
      const pendingGames = result.games.filter((g) => g.amountPending);
      if (pendingGames.length > 0) {
        registerResultPushSubscription(
          result.drawNo,
          pendingGames.map((g) => ({ numbers: g.numbers, type: g.type })),
        );
      }
    } else {
      addTickets(
        result.games.map((g) => ({
          drawNo: result.drawNo,
          numbers: g.numbers,
          purchaseType: g.type,
        })),
      );
      scheduleDrawReminder(result.drawNo).catch((err) => reportError(err, "mylotto-reminder"));
      registerResultPushSubscription(
        result.drawNo,
        result.games.map((g) => ({ numbers: g.numbers, type: g.type })),
      );
    }

    setSaveState("saved");
    // "저장됨 ✓"을 잠깐 보여준 뒤 자동으로 닫아 바로 다음 용지를 찍을 수 있게 한다
    // (예전엔 "닫고 다음 QR 스캔"을 한 번 더 눌러야 했음).
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = setTimeout(() => {
      handleCloseSheet();
    }, AUTO_CLOSE_AFTER_SAVE_MS);
  }, [result, addTickets, handleCloseSheet]);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    // canAskAgain=false는 iOS/Android가 이미 "다시 묻지 않음"으로 처리한 상태라
    // requestPermission()을 다시 불러도 시스템 팝업이 뜨지 않는다(무반응처럼 보임).
    // 이 경우엔 앱 설정 화면으로 직접 보내야 한다. 앱스토어 심사에서 권한 거부 시
    // 검은 화면만 남는 것도 리젝 사유가 될 수 있어 항상 안내 문구+버튼을 보여준다.
    const canAskAgain = permission.canAskAgain;
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>QR 당첨 확인을 위해 카메라 권한이 필요합니다.</Text>
        {canAskAgain ? (
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>카메라 권한 허용</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.permissionButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.permissionButtonText}>설정으로 이동</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (cameraError) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>카메라를 사용할 수 없어요. 앱을 재시작한 뒤 다시 시도해 주세요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          active={isFocused}
          enableTorch={torchOn}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarcodeScanned}
          onMountError={handleCameraMountError}
        />
        <View style={styles.guideOverlay} pointerEvents="none">
          <Text style={styles.guideText}>로또 용지의 QR코드를 비춰주세요</Text>
        </View>
        <Pressable
          style={[styles.torchButton, torchOn && styles.torchButtonActive]}
          onPress={() => setTorchOn((v) => !v)}
          hitSlop={8}
        >
          <Text style={styles.torchButtonIcon}>{torchOn ? "🔦" : "💡"}</Text>
        </Pressable>
      </View>

      <View style={styles.vaultPanel}>
        <Pressable style={styles.vaultPanelHeader} onPress={() => router.push("/mylotto")}>
          <Text style={styles.vaultPanelTitle}>🎟️ 내 복권 보관함</Text>
          <Text style={styles.vaultPanelMore}>전체보기 ›</Text>
        </Pressable>
        {recentTickets.length === 0 ? (
          <View style={styles.vaultEmpty}>
            <Text style={styles.vaultEmptyText}>스캔한 복권이 여기에 저장돼요</Text>
          </View>
        ) : (
          <FlatList
            data={Array.from(groupTicketsByDraw(recentTickets).entries())}
            keyExtractor={(item) => `draw-${item[0]}`}
            renderItem={({ item: [drawNo, tickets] }) => <VaultDrawCard drawNo={drawNo} tickets={tickets} />}
            contentContainerStyle={styles.vaultList}
            scrollEnabled={false}
            pagingEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <Modal visible={result !== null} transparent animationType="slide" onRequestClose={handleCloseSheet}>
        <Pressable style={styles.sheetBackdrop} onPress={handleCloseSheet}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {result?.status === "unrecognized" && (
              <>
                <Text style={styles.sheetTitle}>인식할 수 없는 QR코드예요</Text>
                <Text style={styles.sheetSubtitle}>로또 6/45 용지의 QR코드가 맞는지 확인해 주세요.</Text>
              </>
            )}
            {result?.status === "pending" && (
              <>
                <Text style={styles.sheetTitle}>{result.drawNo}회 추첨 전이에요</Text>
                <Text style={styles.sheetSubtitle}>
                  보관함에 저장하면 추첨일에 알림을 보내드리고, 결과가 나오면 자동으로 당첨을 확인해요.
                </Text>
                <View style={styles.gamesList}>
                  <View style={styles.groupHeaderRow}>
                    <Text style={styles.groupDraw}>{result.drawNo}회</Text>
                    <Text style={styles.groupSpent}>
                      {(LOTTO_UNIT_PRICE * result.games.length).toLocaleString()}원치 · {result.games.length}게임
                    </Text>
                  </View>
                  {result.games.map((game, idx) => (
                    <View key={idx} style={styles.gameRow}>
                      <View style={styles.gameIndexBox}>
                        <Text style={styles.gameIndex}>{String.fromCharCode(97 + idx)}</Text>
                      </View>
                      <View style={styles.gameBalls}>
                        {game.numbers.map((n) => (
                          <LottoBall key={n} number={n} size="small" />
                        ))}
                      </View>
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingBadgeText}>추첨 전</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <Pressable
                  style={[styles.saveButton, saveState === "saved" && styles.saveButtonDone]}
                  onPress={handleSaveToVault}
                  disabled={saveState !== "idle"}
                >
                  <Text style={styles.saveButtonText}>
                    {saveState === "saved" ? "보관함에 저장됨 ✓" : saveState === "saving" ? "저장 중..." : "🎟️ 보관함에 저장하고 알림받기"}
                  </Text>
                </Pressable>
              </>
            )}
            {result?.status === "error" && (
              <>
                <Text style={styles.sheetTitle}>일시적인 오류가 발생했어요</Text>
                <Text style={styles.sheetSubtitle}>네트워크 상태를 확인한 뒤 다시 스캔해 주세요.</Text>
              </>
            )}
            {result?.status === "ok" && (() => {
              const winningSet = new Set(result.winningNumbers);
              const bestRank = result.games.reduce<WinRank>((best, g) => {
                if (g.rank === null) return best;
                return best === null ? g.rank : Math.min(best, g.rank) as WinRank;
              }, null);
              return (
                <ScrollView style={styles.checkScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.checkTitle}>로또 6/45 제{result.drawNo}회</Text>
                  <Text style={styles.checkDate}>{result.drawDate} 추첨</Text>

                  <Text style={styles.checkLabel}>당첨번호</Text>
                  <View style={styles.checkWinningRow}>
                    {result.winningNumbers.map((n) => (
                      <LottoBall key={n} number={n} size="small" />
                    ))}
                    <Text style={styles.checkPlus}>+</Text>
                    <LottoBall number={result.bonusNumber} size="small" isBonus />
                  </View>

                  <View style={[styles.checkMessageBox, bestRank && styles.checkMessageBoxWin]}>
                    {bestRank ? (
                      <Text style={styles.checkMessageWin}>
                        축하합니다!{"\n"}
                        <Text style={styles.checkMessageWinRank}>{RANK_LABEL[bestRank]}</Text>에 당첨되었습니다.
                      </Text>
                    ) : (
                      <Text style={styles.checkMessage}>
                        아쉽게도,{"\n"}낙첨되었습니다.
                      </Text>
                    )}
                  </View>

                  <View style={styles.checkTable}>
                    {result.games.map((game, idx) => (
                      <View key={idx} style={styles.checkTableRow}>
                        <View style={styles.checkTableIndexCol}>
                          <Text style={styles.checkTableIndex}>{String.fromCharCode(65 + idx)}</Text>
                          <Text style={styles.checkTableRank}>{game.rank ? RANK_LABEL[game.rank] : "낙첨"}</Text>
                        </View>
                        <View style={styles.checkTableNumbers}>
                          {game.numbers.map((n) => {
                            const matched = winningSet.has(n) || n === result.bonusNumber;
                            return matched ? (
                              <LottoBall key={n} number={n} size="xs" />
                            ) : (
                              <Text key={n} style={styles.checkTableNumberPlain}>{n}</Text>
                            );
                          })}
                        </View>
                        {game.rank && <Text style={styles.winAmount}>{game.prizeAmount.toLocaleString()}원</Text>}
                      </View>
                    ))}
                  </View>

                  <Text style={styles.checkDisclaimer}>
                    QR 당첨 확인은 보조적인 수단입니다. 반드시 로또 공식 웹사이트에서 실제 복권과의 일치 여부를
                    확인하시기 바랍니다. 당첨금은 실제 복권 소지자에게만 지급됩니다.
                  </Text>

                  <View style={styles.checkButtonRow}>
                    <Pressable
                      style={styles.checkSecondaryButton}
                      onPress={() => Linking.openURL(result.sourceUrl)}
                    >
                      <Text style={styles.checkSecondaryButtonText}>인터넷에서 확인</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.saveButton, styles.checkPrimaryButton, saveState === "saved" && styles.saveButtonDone]}
                      onPress={handleSaveToVault}
                      disabled={saveState !== "idle"}
                    >
                      <Text style={styles.saveButtonText}>
                        {saveState === "saved" ? "저장됨 ✓" : saveState === "saving" ? "저장 중..." : "🎟️ 보관함에 저장"}
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
              );
            })()}
            <Pressable style={styles.closeButton} onPress={handleCloseSheet}>
              <Text style={styles.closeButtonText}>닫고 다음 QR 스캔</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  // 화면을 카메라(상단)/보관함(하단) 정확히 반반으로 분할.
  cameraContainer: { flex: 1 },
  vaultPanel: { flex: 1, backgroundColor: colors.background },
  camera: { flex: 1 },
  guideOverlay: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  guideText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  permissionText: { fontSize: 15, color: colors.textPrimary, textAlign: "center" },
  permissionButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  permissionButtonText: { color: "#fff", fontWeight: "700" },
  vaultPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  vaultPanelTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  vaultPanelMore: { fontSize: 12, fontWeight: "700", color: colors.primary },
  vaultList: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.lg },
  vaultEmpty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  vaultEmptyText: { fontSize: 13, color: colors.textMuted },
  vaultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...cardShadow,
    minHeight: 240,
  },
  vaultCardTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  vaultCardGame: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  vaultCardGameIndex: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, minWidth: 18 },
  vaultCardBalls: { flexDirection: "row", gap: 4 },
  vaultCardBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  vaultCardBadgeWin: { backgroundColor: colors.gold },
  vaultCardBadgeLose: { backgroundColor: colors.rankNeutral },
  vaultCardBadgePending: { backgroundColor: colors.rankNeutral },
  vaultCardBadgeText: { color: "#fff", fontWeight: "700", fontSize: 10 },
  vaultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...cardShadow,
  },
  vaultRowInfo: { gap: 2 },
  vaultRowDraw: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  vaultRowBalls: { flexDirection: "row", gap: 3, flexWrap: "wrap" },
  vaultRowBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  vaultRowBadgeWin: { backgroundColor: colors.gold },
  vaultRowBadgePending: { backgroundColor: colors.rankNeutral },
  vaultRowBadgeText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  torchButton: {
    position: "absolute",
    right: 16,
    bottom: 40,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  torchButtonActive: { backgroundColor: colors.goldBright },
  torchButtonIcon: { fontSize: 22 },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    maxHeight: "90%",
    ...cardShadow,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  sheetSubtitle: { fontSize: 13, color: colors.textSecondary },
  gamesList: { flexShrink: 0, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  groupHeaderRow: {
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  groupDraw: { fontSize: 14, fontWeight: "800", color: colors.textPrimary, fontFamily: numericFont.medium },
  groupSpent: { fontSize: 12, color: colors.textSecondary, fontFamily: numericFont.regular },
  drawInfoCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
  drawInfoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  drawNumber: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, fontFamily: numericFont.bold },
  deleteIconText: { fontSize: 20 },
  drawMeta: { fontSize: 12, color: colors.textSecondary },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  gameIndexBox: { minWidth: 20, alignItems: "center" },
  gameIndex: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  gameBalls: { flex: 1, flexDirection: "row", gap: 3, flexWrap: "wrap" },
  gameRight: { alignItems: "flex-end", gap: 4 },
  pendingBadge: { backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pendingBadgeText: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  winAmount: { fontSize: 12, fontWeight: "700", color: colors.primary, fontFamily: numericFont.medium },
  gameRowLarge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  gameIndexLarge: { fontSize: 15, fontWeight: "700", color: colors.textSecondary, minWidth: 26 },
  gamesBallsLarge: { flex: 1, flexDirection: "row", gap: spacing.md, alignItems: "center" },
  gameBallContainer: { alignItems: "center", justifyContent: "center" },
  rankBadgeLarge: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  rankBadgeWinLarge: { backgroundColor: colors.gold },
  rankBadgeLoseLarge: { backgroundColor: colors.rankNeutral },
  rankBadgeTextLarge: { color: "#fff", fontWeight: "700", fontSize: 13 },
  closeButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  closeButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  saveButton: {
    backgroundColor: colors.goldBright,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveButtonDone: { backgroundColor: colors.rankNeutral },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  checkScroll: { flexGrow: 0 },
  checkTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  checkDate: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: 2, marginBottom: spacing.md },
  checkLabel: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, textAlign: "center", marginBottom: spacing.sm },
  checkWinningRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginBottom: spacing.lg },
  checkPlus: { fontSize: 16, fontWeight: "700", color: colors.textMuted },
  checkMessageBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  checkMessageBoxWin: { backgroundColor: colors.goldLight },
  checkMessage: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, textAlign: "center", lineHeight: 22 },
  checkMessageWin: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, textAlign: "center", lineHeight: 22 },
  checkMessageWinRank: { color: colors.primary, fontSize: 17 },
  checkTable: { borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  checkTableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  checkTableIndexCol: { minWidth: 44, alignItems: "center", gap: 2 },
  checkTableIndex: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  checkTableRank: { fontSize: 10, fontWeight: "600", color: colors.textMuted },
  checkTableNumbers: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  checkTableNumberPlain: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, minWidth: 22, textAlign: "center" },
  checkDisclaimer: { fontSize: 10, color: colors.textMuted, lineHeight: 15, marginBottom: spacing.md },
  checkButtonRow: { flexDirection: "row", gap: spacing.sm },
  checkSecondaryButton: {
    flex: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  checkSecondaryButtonText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  checkPrimaryButton: { flex: 1, marginTop: 0 },
});
