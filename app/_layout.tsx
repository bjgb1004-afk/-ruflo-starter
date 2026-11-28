import { useEffect } from "react";
import { AppState, View } from "react-native";
import { Stack, usePathname } from "expo-router";
import { SystemBars } from "react-native-edge-to-edge";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryCache, MutationCache, focusManager } from "@tanstack/react-query";
import * as Updates from "expo-updates";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { initSentry } from "@/lib/sentry";
import { logAppOpen, logScreenView } from "@/lib/analytics";
import { checkForNativeUpdate } from "@/lib/inAppUpdate";
import { recordLaunch } from "@/lib/storeReview";
import { reportError } from "@/lib/errorLog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/useAuth";
import { useFavoritesCloudSync } from "@/features/favorites/useFavoritesCloudSync";
import { cleanupLegacyDrawReminders } from "@/features/mylotto/drawReminders";
import { scheduleSpittoWeeklyReminder } from "@/features/spitto/weeklyReminder";
import { scheduleRankingWeeklyReminder } from "@/features/stores/rankingWeeklyReminder";
import { AdBanner } from "@/features/ads/AdBanner";
import { UpdateGate } from "@/features/appUpdate/components/UpdateGate";
import { UpdatePopup } from "@/features/notices/components/UpdatePopup";
import { useAutoCheckTickets } from "@/features/mylotto/useAutoCheckTickets";
import { colors } from "@/constants/theme";
// 지오펜스 백그라운드 태스크는 앱 로드 시점에 반드시 최상위에서 등록되어야
// OS가 재시작 후 백그라운드에서 앱을 깨울 때도 태스크를 찾을 수 있다.
import "@/features/geofencing/geofenceTask";

// 모든 API(Supabase 쿼리) 실패를 화면마다 따로 try/catch로 잡지 않고 이 한 곳에서
// Sentry로 보낸다 - "실제 사용자 폰에서 네트워크 오류가 얼마나 나는지" 확인하려면
// 개별 화면 코드를 다 훑는 것보다 이 방식이 누락 없이 안전하다.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 기본 1분 캐시 (개별 쿼리에서 필요 시 override)
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false, // RN에는 브라우저 탭 포커스 개념이 없어 불필요한 리페치 방지
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      reportError(error, `api:${String(query.queryKey[0] ?? "unknown")}`);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      reportError(error, "api:mutation");
    },
  }),
});

// 앱을 껐다 켜면 쿼리 캐시가 메모리에서 날아가 매번 Supabase를 다시 조회했다 - AsyncStorage에
// 캐시를 저장해 재실행 시 마지막 데이터를 즉시 보여주고, 백그라운드에서만 새로고침한다.
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "lotto-query-cache",
});

// 모든 화면 바닥에 배너를 한 줄 깐다. 화면 파일마다 붙이면 return 분기가 여럿이라 반드시
// 빠뜨린다. 탭바를 없앤 뒤(2026-11-28)로는 배너를 놓는 곳이 여기 하나뿐이다 - 전에는
// 탭바 위에도 한 줄 있어서 "어느 화면이 어느 배너를 쓰는지"를 늘 따져야 했다.
//
// 관리자 화면만 뺀다(내부용이라 광고를 띄울 자리가 아니고, 내가 직접 누르는 화면이라
// 자기 광고 클릭으로 잡힌다).
const AD_FREE_ROUTES = new Set(["admin"]);

const ScreenWithAd = ({ route, children }: { route: { name: string }; children: React.ReactElement }) =>
  AD_FREE_ROUTES.has(route.name) ? (
    children
  ) : (
    <View style={{ flex: 1 }}>
      {children}
      <AdBanner safeBottom />
    </View>
  );

export default function RootLayout() {
  const initAuth = useAuth((s) => s.init);
  useFavoritesCloudSync();
  // 보관함 티켓의 추첨 결과 대조는 mylotto.tsx(전체 목록) 안에만 있었다 - 같은 "추첨 전"
  // 배지를 그리는 스캔 탭 보관함(scan.tsx)에서는 대조가 돌지 않아, 추첨이 끝나고 서버에
  // 결과가 있어도 전체 목록 화면을 한 번 열기 전까지 계속 "추첨 전"으로 보였다. 화면이
  // 아니라 앱 단위의 관심사이므로 루트에서 한 번만 돌린다.
  useAutoCheckTickets();

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    initSentry();
    initAuth();
    logAppOpen();
    cleanupLegacyDrawReminders().catch((err) => reportError(err, "cleanup-legacy-reminders"));
    // 다음 금요일 스피또 알림을 그때의 최신 숫자로 다시 예약한다. identifier가 고정이라
    // 여러 번 열어도 쌓이지 않는다. 알림 권한이 없으면 아무것도 안 하고 조용히 끝난다.
    scheduleSpittoWeeklyReminder().catch((err) => reportError(err, "spitto-weekly-reminder"));
    scheduleRankingWeeklyReminder().catch((err) => reportError(err, "ranking-weekly-reminder"));
  }, [initAuth]);

  // 화면 전환마다 몇명이 어디를 보는지 재려고 경로가 바뀔 때마다 한 번씩 기록한다.
  const pathname = usePathname();
  useEffect(() => {
    logScreenView(pathname);
  }, [pathname]);

  // 기본 동작(체크 후 백그라운드 다운로드만 해두고 "다음번" 재실행에서야 적용)은 사용자가
  // 두 번 완전 재시작해야 최신 코드를 보는 상황을 만든다 - 받자마자 그 자리에서 한 번 더
  // 리로드해 앱을 한 번만 열어도 최신 버전이 뜨게 한다. Updates.isEnabled는 개발 빌드/Expo
  // Go에서 false라 프로덕션 빌드에서만 동작한다.
  useEffect(() => {
    if (!Updates.isEnabled) return;
    (async () => {
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (!isAvailable) return;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch (err) {
        reportError(err, "ota-update-check");
      }
    })();
  }, []);

  // JS만 바꾸는 OTA와 달리, 네이티브 부품(FCM, 광고 SDK 등)이 들어간 변경은 이 체크로
  // 스토어 새 버전을 강제로 받게 한다 - 안 그러면 구버전 껍데기가 영원히 남아있게 된다.
  useEffect(() => {
    checkForNativeUpdate();
  }, []);

  // 인앱 리뷰 팝업 조건(누적 실행 횟수·설치 후 경과일) 판단용 실행 기록. 리뷰 요청 자체는
  // 당첨 확인 성공 지점(scan.tsx)에서 뜬다 - 여긴 "몇 번째 실행인지"만 센다.
  useEffect(() => {
    recordLaunch();
  }, []);

  // 로또 추첨은 매주 토요일 20시35분 KST - GitHub Actions의 schedule 트리거는 정시성이
  // 없어(부하 시 몇 시간 지연/스킵 가능, 실측으로 확인됨) 추첨 후 시간대에 앱을 여는 순간
  // 서버에 최신 회차 반영을 재촉한다. 요일/시간을 여기서 먼저 걸러 그 외엔 서버 호출 자체를
  // 안 만든다 - 어차피 그 시간대가 아니면 신규 회차가 있을 수 없다. 실제 "먼저 연 사람만
  // 트리거, 이후엔 무시"는 Edge Function 쪽 sync_lock 원자적 UPDATE로 처리한다(가볍게 여러 번
  // 불러도 안전하다).
  //
  // 마운트 시점에만 재던지면, 토요일 저녁 8시가 되기 전부터 앱을 계속 켜놓고 있던 사람은
  // 이 체크 자체가 다시 안 돈다 - 화면을 포그라운드로 복귀할 때마다 다시 확인해야 한다
  // (2026-11-28 실측: 추첨 15분 뒤에도 홈 화면이 지난 회차에 머물러 있었음).
  useEffect(() => {
    const maybeTriggerDrawSync = () => {
      const now = new Date();
      const kstHour = (now.getUTCHours() + 9) % 24;
      const kstDay = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDay(); // 0=일 ... 6=토
      const isDrawWindow = kstDay === 6 && kstHour >= 20;
      if (!isDrawWindow) return;

      supabase.functions.invoke("trigger-draw-sync").catch((err) => reportError(err, "trigger-draw-sync"));
    };

    maybeTriggerDrawSync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") maybeTriggerDrawSync();
    });
    return () => subscription.remove();
  }, []);

  // react-query의 refetchOnWindowFocus는 브라우저 탭 포커스(document.visibilitychange)를
  // 본다 - RN엔 그게 없어 기본으로는 "항상 포커스됨"으로 취급돼 동작하지 않는다. 포그라운드
  // 복귀를 이걸로 대신 알려줘야 refetchOnWindowFocus: true를 켠 개별 쿼리(홈 화면의 최신
  // 회차 등)가 실제로 돈다. 전역 기본값(defaultOptions.refetchOnWindowFocus)은 그대로
  // false라 이 연결만으로 모든 쿼리가 갑자기 다시 불려오진 않는다.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => subscription.remove();
  }, []);

  // 숫자 전용 폰트가 준비되기 전에 화면이 먼저 그려지면 순위/점수 숫자가
  // 시스템 폰트로 한 번 렌더링됐다가 폰트로 바뀌면서 깜빡이므로, 로딩 완료까지 대기한다.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister, maxAge: 24 * 60 * 60 * 1000 }}
      >
        {/* expo-status-bar는 Android 15 엣지투엣지에서 배경/아이콘 색 제어가 조용히
            무시되어(StatusBar.setBackgroundColor 등 deprecated API 사용) 흰 배경에 흰
            아이콘이 겹쳐 상태표시줄이 안 보이는 문제가 실기기에서 확인됐다 - 엣지투엣지를
            제대로 지원하는 react-native-edge-to-edge의 SystemBars로 교체. 배경이 대체로
            밝은 종이색이라 dark(짙은 아이콘)로 고정한다. */}
        <SystemBars style="dark" />
        <Stack screenLayout={ScreenWithAd}>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          {/* 홈 버튼으로 들어오는 화면이라 헤더(=뒤로가기 화살표)를 띄운다. 탭이었을 때는
              첫 화면이라 돌아갈 곳이 없어 헤더를 숨겼는데, 지금 숨기면 눈에 보이는
              나가는 길이 안드로이드 하드웨어 버튼뿐이다. 색은 다른 화면 헤더와 같은
              종이색이다 - 바로 아래 당첨번호 띠가 먹색이라 거기에 맞추고 싶어지지만,
              그러면 이 화면만 검은 헤더가 되고 짙은 상태표시줄 아이콘이 안 보인다. */}
          <Stack.Screen
            name="scan"
            options={{
              title: "QR 당첨확인",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.textPrimary,
              headerTitleStyle: { fontWeight: "800" },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen name="store/[id]" options={{ title: "판매점 상세" }} />
          <Stack.Screen name="draw/[drawNo]" options={{ title: "회차 배출업소" }} />
          <Stack.Screen name="mylotto" options={{ title: "내 복권 보관함" }} />
          <Stack.Screen name="ticket-entry" options={{ title: "번호 직접 입력" }} />
          <Stack.Screen name="replay" options={{ title: "놓친 당첨금" }} />
          <Stack.Screen name="admin" options={{ title: "관리자" }} />
        </Stack>
        {/* 구버전 껍데기에 갇힌 앱에만 뜨는 "스토어에서 업데이트" 전체화면. 서버에
            해당 런타임 표식이 등록돼 있을 때만 그려지고, 평소엔 null이다. Stack
            뒤에 둬서 탭바·헤더까지 덮는다 - 뒤 화면을 만질 수 있으면 안내가 아니다. */}
        <UpdateGate />
        {/* 업데이트 소식 팝업. 여기 한 번만 달아둔다 - 화면마다 달면 두 개가 겹쳐 뜬다.
            UpdateGate보다 뒤(= 아래 층)에 둬서, 구버전 안내가 뜬 상황에서는 소식이
            그 위를 덮지 않게 한다. 안내를 가리면 탈출 경로를 못 찾는다. */}
        <UpdatePopup />
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
