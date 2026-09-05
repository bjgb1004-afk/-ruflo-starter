import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { reportError } from "@/lib/errorLog";
import { TicketNumberRow } from "@/components/TicketNumberRow";
import { getDrawByNo, type DrawSummary } from "@/features/draws/api/drawHistoryApi";
import { useDrawsByNo } from "@/features/draws/useDrawsByNo";
import { parseLottoQr, type ParsedLottoGame } from "@/features/qr/parseLottoQr";
import { computeWinRank, getPrizeAmount, type WinRank } from "@/features/qr/checkWinnings";
import { useMyLottoTickets, type MyLottoTicket } from "@/features/mylotto/useMyLottoTickets";
import { groupTicketsByDraw, withGameLabel, type TicketGroup } from "@/features/mylotto/groupTickets";
import { useScanSettings } from "@/features/mylotto/useScanSettings";
import { scheduleDrawReminder } from "@/features/mylotto/drawReminders";
import { registerResultPushSubscription } from "@/features/mylotto/pushSubscription";
import { colors, spacing, radius, cardShadow } from "@/constants/theme";

// 같은 용지를 계속 카메라에 비추고 있을 때, 스캔 직후 즉시 재인식되어 중복 저장되는
// "깜빡임"을 막기 위한 잠금 해제 지연 시간.
const RESCAN_LOCK_MS = 1500;
// 인식불가/에러는 저장할 게 없어 사용자 입력을 기다리지 않고 이 시간 뒤 자동으로 닫는다.
const AUTO_CLOSE_AFTER_FAIL_MS = 2000;
// 자동촬영 모드일 때 "저장됐다"는 걸 화면으로도 보여주는 짧은 배너 노출 시간.
const AUTO_TOAST_MS = 1600;

type GameResult = ParsedLottoGame & { rank: WinRank; prizeAmount: number; amountPending: boolean };

type OkScan = {
  status: "ok";
  drawNo: number;
  drawDate: string;
  winningNumbers: number[];
  bonusNumber: number;
  games: GameResult[];
  qrUrl: string;
};
type PendingScan = { status: "pending"; drawNo: number; games: ParsedLottoGame[]; qrUrl: string };

// 연속촬영(자동모드): 스캔에 성공하면(당첨확인/추첨전) 모달을 띄우지 않고 곧바로 저장한다 -
// 결과 텍스트를 읽기도 전에 자동으로 닫히는 모달은 오히려 확인을 방해한다는 피드백에 따라,
// 대신 하단 보관함 리스트에 카드가 즉시 쌓이는 것 + 짧은 토스트로 저장 여부를 확인한다.
type SaveableScan = OkScan | PendingScan;

// 수동모드에서만 뜨는 결과 모달 + 저장할 게 없는 경우(인식불가/에러)는 모드와 무관하게 항상 모달.
type ModalResult = OkScan | PendingScan | { status: "unrecognized" } | { status: "error" };

const RANK_LABEL: Record<Exclude<WinRank, null>, string> = {
  1: "1등",
  2: "2등",
  3: "3등",
  4: "4등",
  5: "5등",
};

// 회차별 카드 컴포넌트. draw가 있으면(체크 완료된 회차) 동행복권 공식 사이트처럼
// 당첨번호와 일치하는 숫자만 색공으로, 나머지는 일반 텍스트로 표시한다. draw를 아직
// 못 받아온 동안(로딩 중/추첨 전)은 기존처럼 전부 색공으로 보여준다.
function VaultDrawCard({
  drawNo,
  tickets,
  draw,
  onDelete,
}: {
  drawNo: number;
  tickets: MyLottoTicket[];
  draw: DrawSummary | null | undefined;
  onDelete: () => void;
}) {
  const winningSet = draw ? new Set(draw.winning_numbers) : null;
  return (
    <View style={styles.vaultCard}>
      <View style={styles.vaultCardHeader}>
        <Text style={styles.vaultCardTitle}>{drawNo}회</Text>
        <Pressable hitSlop={8} onPress={onDelete}>
          <Text style={styles.vaultCardDeleteIcon}>🗑️</Text>
        </Pressable>
      </View>
      {withGameLabel(tickets).map(({ ticket, label }) => (
        <View key={ticket.id} style={styles.vaultCardGame}>
          <Text style={styles.vaultCardGameIndex}>{label}</Text>
          <TicketNumberRow
            numbers={ticket.numbers}
            winningSet={winningSet}
            bonusNumber={draw?.bonus_number}
            ballSize="xs"
            containerStyle={styles.vaultCardBalls}
            plainTextStyle={styles.vaultCardNumberPlain}
          />
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
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ModalResult | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [toast, setToast] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const addTickets = useMyLottoTickets((s) => s.addTickets);
  const removeTicket = useMyLottoTickets((s) => s.removeTicket);
  const clearAll = useMyLottoTickets((s) => s.clearAll);
  // 자동촬영 on/off - 이 기기에만 저장되고 서버로는 안 간다(useScanSettings.ts). 켜고 끄는
  // 스위치 자체는 설정 화면(settings.tsx)에 있다 - 카메라 화면 위에 얹으면 안내 문구를 가린다.
  const autoCapture = useScanSettings((s) => s.autoCapture);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 화면을 카메라(상단)/보관함(하단) 2분할로 나누고, 저장한 순간 하단 목록이 실시간으로
  // 갱신되는 걸 보여준다 - 스캔 결과를 모달로 잠깐 띄우는 대신, 계속 쌓이는 이 리스트를
  // 드래그해서 훑어보는 것 자체가 "연속촬영" 결과 확인 방법이다.
  const ticketsMap = useMyLottoTickets((s) => s.tickets);
  const recentTickets = useMemo(
    () =>
      Object.values(ticketsMap)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .slice(0, 30),
    [ticketsMap],
  );
  // 보관함 카드의 번호를 실제 당첨번호와 매칭해 색칠하려면 회차별 당첨번호가 필요하다.
  const recentDrawNos = useMemo(() => [...new Set(recentTickets.map((t) => t.drawNo))], [recentTickets]);
  const drawsByNo = useDrawsByNo(recentDrawNos);

  // 회차(그룹) 단위로 삭제한다 - mylotto.tsx의 handleDeleteGroup과 동일한 방식(파괴적
  // 동작이라 확인 알럿을 거친다).
  const handleDeleteVaultGroup = useCallback(
    (group: TicketGroup) => {
      Alert.alert("보관함에서 삭제", `${group.drawNo}회 ${group.tickets.length}게임을 삭제할까요?`, [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: "destructive", onPress: () => group.tickets.forEach((t) => removeTicket(t.id)) },
      ]);
    },
    [removeTicket],
  );

  // 되돌릴 수 없는 파괴적 동작이라 회차별 삭제(handleDeleteVaultGroup)와 동일하게 확인
  // 알럿을 거친다 - mylotto.tsx의 handleClearAll과 같은 스토어(clearAll)를 그대로 쓴다.
  const handleClearAll = useCallback(() => {
    Alert.alert("전체 삭제", "저장된 복권을 모두 삭제할까요? 되돌릴 수 없어요.", [
      { text: "취소", style: "cancel" },
      { text: "전체 삭제", style: "destructive", onPress: () => clearAll() },
    ]);
  }, [clearAll]);

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

  // 결과 처리 중(파싱→DB조회→저장)에는 카메라 이벤트를 무시해 중복 스캔/중복 저장을 막는다.
  const scanLockRef = useRef(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), AUTO_TOAST_MS);
  }, []);

  // 같은 용지가 계속 프레임 안에 있어도 곧바로 중복 저장되지 않도록, 일정 시간 뒤에만
  // 다음 스캔 잠금을 푼다.
  const scheduleRescanUnlock = useCallback(() => {
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      scanLockRef.current = false;
    }, RESCAN_LOCK_MS);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setResult(null);
    scheduleRescanUnlock();
  }, [scheduleRescanUnlock]);

  const saveResult = useCallback(
    (data: SaveableScan) => {
      if (data.status === "ok") {
        addTickets(
          data.games.map((g) =>
            g.amountPending
              ? { drawNo: data.drawNo, numbers: g.numbers, purchaseType: g.type }
              : { drawNo: data.drawNo, numbers: g.numbers, purchaseType: g.type, checked: true, rank: g.rank, prizeAmount: g.prizeAmount },
          ),
        );
        // 금액 집계가 아직 안 끝난 게임이 있으면(1~3등 파리뮤추얼 금액 null), 다음 보관함
        // 방문 때 재검사되긴 하지만 그새 앱을 안 열 수도 있으니 결과가 확정되면 푸시로도 알려준다.
        const pendingGames = data.games.filter((g) => g.amountPending);
        if (pendingGames.length > 0) {
          registerResultPushSubscription(
            data.drawNo,
            pendingGames.map((g) => ({ numbers: g.numbers, type: g.type })),
          );
        }
      } else {
        addTickets(
          data.games.map((g) => ({
            drawNo: data.drawNo,
            numbers: g.numbers,
            purchaseType: g.type,
          })),
        );
        scheduleDrawReminder(data.drawNo).catch((err) => reportError(err, "mylotto-reminder"));
        registerResultPushSubscription(
          data.drawNo,
          data.games.map((g) => ({ numbers: g.numbers, type: g.type })),
        );
      }
    },
    [addTickets],
  );

  const handleBarcodeScanned = useCallback(
    async (scan: BarcodeScanningResult) => {
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
          // 보관함에 저장하고 추첨일에 알림받는 흐름으로 처리한다.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const pending: PendingScan = { status: "pending", drawNo: parsed.drawNo, games: parsed.games, qrUrl: scan.data };
          if (autoCapture) {
            saveResult(pending);
            showToast(`${parsed.drawNo}회 저장됨 · 추첨 전`);
            scheduleRescanUnlock();
          } else {
            setResult(pending);
          }
          return;
        }
        // 1~3등은 회차별 변동(파리뮤추얼) 금액이라 추첨 직후(토 20:35~21:10경)엔 당첨번호만
        // 먼저 채워지고 금액 집계가 비어있을 수 있다(useAutoCheckTickets.ts, 서버 알림 스크립트와
        // 동일 이유). 이 경우 여기서 바로 "0원"으로 확정 저장하면 checked=true로 영구 고정되어
        // 나중에 실제 금액이 채워져도 다시는 재검사되지 않는다 - amountPending으로 표시해
        // saveResult가 checked:false로 저장하게 한다.
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
        const ok: OkScan = {
          status: "ok",
          drawNo: draw.draw_no,
          drawDate: draw.draw_date,
          winningNumbers: draw.winning_numbers,
          bonusNumber: draw.bonus_number,
          games,
          qrUrl: scan.data,
        };
        if (autoCapture) {
          saveResult(ok);
          const bestRank = games.reduce<WinRank>((best, g) => {
            if (g.rank === null) return best;
            return best === null ? g.rank : (Math.min(best, g.rank) as WinRank);
          }, null);
          showToast(`${draw.draw_no}회 저장됨 · ${bestRank ? RANK_LABEL[bestRank] + " 당첨!" : "낙첨"}`);
          scheduleRescanUnlock();
        } else {
          setResult(ok);
        }
      } catch (err) {
        // QR 자체는 정상 파싱됐는데 네트워크/DB 조회가 실패한 경우다. "인식할 수 없는 QR"이라고
        // 하면 사용자가 용지를 의심하게 되므로, 원인이 다른 별도 상태로 구분해 안내한다.
        reportError(err, "qr-scan-lookup");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setResult({ status: "error" });
      }
    },
    [saveResult, scheduleRescanUnlock, autoCapture, showToast],
  );

  // 수동모드에서 결과가 뜨면 사용자가 직접 "보관함에 저장"을 눌러야 저장된다.
  const handleManualSave = useCallback(() => {
    if (!result || (result.status !== "ok" && result.status !== "pending")) return;
    saveResult(result);
    setSaveState("saved");
  }, [result, saveResult]);

  // 앱 자체 계산 결과 말고 동행복권 공식 사이트 결과도 직접 보고 싶다는 요청 - QR 스캔 시
  // 원본으로 찍힌 URL(https://qr.dhlottery.co.kr/?v=...)을 그대로 열면 공식 결과 페이지로 간다.
  const handleOpenOfficialSite = useCallback(() => {
    if (!result || (result.status !== "ok" && result.status !== "pending")) return;
    Linking.openURL(result.qrUrl).catch((err) => reportError(err, "qr-scan-open-official"));
  }, [result]);

  // 인식불가/에러, 그리고 수동모드에서 저장까지 끝난 결과는 사용자가 닫기를 누르지 않아도
  // 일정 시간 뒤 자동으로 닫혀 다음 용지를 계속 비출 수 있게 한다. 수동모드에서 아직 저장
  // 전인 ok/pending은 사용자가 직접 판단해야 하니 자동으로 닫지 않는다.
  useEffect(() => {
    if (!result) return;
    if ((result.status === "ok" || result.status === "pending") && saveState !== "saved") return;
    const timer = setTimeout(() => handleCloseSheet(), AUTO_CLOSE_AFTER_FAIL_MS);
    return () => clearTimeout(timer);
  }, [result, saveState, handleCloseSheet]);

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
        {toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
        <Pressable
          style={[styles.torchButton, torchOn && styles.torchButtonActive]}
          onPress={() => setTorchOn((v) => !v)}
          hitSlop={8}
        >
          <Text style={styles.torchButtonIcon}>{torchOn ? "🔦" : "💡"}</Text>
        </Pressable>
      </View>

      <View style={styles.vaultPanel}>
        <View style={styles.vaultPanelHeader}>
          <Text style={styles.vaultPanelTitle}>🎟️ 내 복권 보관함</Text>
          <View style={styles.vaultPanelHeaderRight}>
            {recentTickets.length > 0 && (
              <Pressable hitSlop={8} onPress={handleClearAll}>
                <Text style={styles.vaultPanelClearAll}>전체삭제</Text>
              </Pressable>
            )}
            <Pressable hitSlop={8} onPress={() => router.push("/mylotto")}>
              <Text style={styles.vaultPanelMore}>전체보기 ›</Text>
            </Pressable>
          </View>
        </View>
        {recentTickets.length === 0 ? (
          <View style={styles.vaultEmpty}>
            <Text style={styles.vaultEmptyText}>스캔한 복권이 여기에 저장돼요</Text>
          </View>
        ) : (
          <FlatList
            data={groupTicketsByDraw(recentTickets)}
            keyExtractor={(item) => `draw-${item.drawNo}`}
            renderItem={({ item }) => (
              <VaultDrawCard
                drawNo={item.drawNo}
                tickets={item.tickets}
                draw={drawsByNo.get(item.drawNo)}
                onDelete={() => handleDeleteVaultGroup(item)}
              />
            )}
            contentContainerStyle={styles.vaultList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <Modal visible={result !== null} transparent animationType="slide" onRequestClose={handleCloseSheet}>
        <Pressable style={styles.sheetBackdrop} onPress={handleCloseSheet}>
          <Pressable
            style={[
              styles.sheet,
              (result?.status === "ok" || result?.status === "pending") && styles.sheetTall,
              { paddingBottom: spacing.xl + insets.bottom },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {result?.status === "unrecognized" && (
              <>
                <Text style={styles.sheetTitle}>인식할 수 없는 QR코드예요</Text>
                <Text style={styles.sheetSubtitle}>로또 6/45 용지의 QR코드가 맞는지 확인해 주세요.</Text>
              </>
            )}
            {result?.status === "error" && (
              <>
                <Text style={styles.sheetTitle}>일시적인 오류가 발생했어요</Text>
                <Text style={styles.sheetSubtitle}>네트워크 상태를 확인한 뒤 다시 스캔해 주세요.</Text>
              </>
            )}
            {result?.status === "pending" && (
              <>
                <Text style={styles.sheetTitle}>{result.drawNo}회 추첨 전이에요</Text>
                <Text style={styles.sheetSubtitle}>저장하면 추첨일에 알림을 보내드려요.</Text>
                <ScrollView style={styles.checkScroll}>
                  {result.games.map((g, idx) => (
                    <View key={idx} style={styles.checkGameRow}>
                      <Text style={styles.checkGameIndex}>{String.fromCharCode(65 + idx)}</Text>
                      <TicketNumberRow numbers={g.numbers} winningSet={null} ballSize="small" containerStyle={styles.checkGameBalls} />
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
            {result?.status === "ok" &&
              (() => {
                const winningSet = new Set(result.winningNumbers);
                const bestRank = result.games.reduce<WinRank>((best, g) => {
                  if (g.rank === null) return best;
                  return best === null ? g.rank : (Math.min(best, g.rank) as WinRank);
                }, null);
                return (
                  <>
                    <Text style={styles.sheetTitle}>
                      {result.drawNo}회 · {bestRank ? `${RANK_LABEL[bestRank]} 당첨!` : "낙첨"}
                    </Text>
                    <Text style={styles.sheetSubtitle}>{result.drawDate} 추첨</Text>
                    <ScrollView style={styles.checkScroll}>
                      {result.games.map((g, idx) => (
                        <View key={idx} style={styles.checkGameRow}>
                          <Text style={styles.checkGameIndex}>{String.fromCharCode(65 + idx)}</Text>
                          <TicketNumberRow
                            numbers={g.numbers}
                            winningSet={winningSet}
                            bonusNumber={result.bonusNumber}
                            ballSize="small"
                            containerStyle={styles.checkGameBalls}
                          />
                          <Text style={styles.checkGameRank}>{g.rank ? RANK_LABEL[g.rank] : "낙첨"}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                );
              })()}
            {(result?.status === "ok" || result?.status === "pending") && (
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.saveButton, styles.actionButton, saveState === "saved" && styles.saveButtonDone]}
                  onPress={handleManualSave}
                  disabled={saveState === "saved"}
                >
                  <Text style={styles.saveButtonText} numberOfLines={1}>
                    {saveState === "saved" ? "저장됨 ✓" : "🎟️ 보관함 저장"}
                  </Text>
                </Pressable>
                <Pressable style={[styles.officialButton, styles.actionButton]} onPress={handleOpenOfficialSite}>
                  <Text style={styles.officialButtonText} numberOfLines={1}>
                    🔗 인터넷 확인
                  </Text>
                </Pressable>
              </View>
            )}
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
  toast: {
    position: "absolute",
    top: 108,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: spacing.lg,
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
  vaultPanelHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  vaultPanelTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  vaultPanelMore: { fontSize: 12, fontWeight: "700", color: colors.primary },
  vaultPanelClearAll: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
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
  vaultCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  vaultCardTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  vaultCardDeleteIcon: { fontSize: 16 },
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
  vaultCardBalls: { flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" },
  vaultCardNumberPlain: { fontSize: 12, fontWeight: "600", color: colors.textPrimary },
  vaultCardBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  vaultCardBadgeWin: { backgroundColor: colors.gold },
  vaultCardBadgeLose: { backgroundColor: colors.rankNeutral },
  vaultCardBadgePending: { backgroundColor: colors.rankNeutral },
  vaultCardBadgeText: { color: "#fff", fontWeight: "700", fontSize: 10 },
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
    maxHeight: "50%",
    ...cardShadow,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  sheetSubtitle: { fontSize: 13, color: colors.textSecondary },
  // 당첨확인(ok)/추첨전(pending)은 게임이 여러 개(a~e)일 수 있어 내용이 많다 - 짧은
  // 인식불가/에러 시트보다 크게 펼친다.
  sheetTall: { maxHeight: "80%" },
  checkScroll: { flexGrow: 0 },
  checkGameRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  checkGameIndex: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, minWidth: 18 },
  checkGameBalls: { flex: 1 },
  checkGameRank: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionButton: { flex: 1, marginTop: 0 },
  saveButton: {
    backgroundColor: colors.goldBright,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  saveButtonDone: { backgroundColor: colors.rankNeutral },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  officialButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  officialButtonText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  closeButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  closeButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
