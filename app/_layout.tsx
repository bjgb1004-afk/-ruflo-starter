import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { SystemBars } from "react-native-edge-to-edge";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
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
import { reportError } from "@/lib/errorLog";
import { initAnalytics } from "@/lib/analytics";
import { useAuth } from "@/features/auth/useAuth";
import { useFavoritesCloudSync } from "@/features/favorites/useFavoritesCloudSync";
import { cleanupLegacyDrawReminders } from "@/features/mylotto/drawReminders";
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

export default function RootLayout() {
  const initAuth = useAuth((s) => s.init);
  useFavoritesCloudSync();

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    initSentry();
    initAnalytics();
    initAuth();
    cleanupLegacyDrawReminders().catch((err) => reportError(err, "cleanup-legacy-reminders"));
  }, [initAuth]);

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
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="store/[id]" options={{ title: "판매점 상세" }} />
          <Stack.Screen name="draw/[drawNo]" options={{ title: "회차 배출업소" }} />
          <Stack.Screen name="mylotto" options={{ title: "내 복권 보관함" }} />
          <Stack.Screen name="admin" options={{ title: "관리자" }} />
          <Stack.Screen name="store-owner/signup" options={{ title: "사장님 인증" }} />
          <Stack.Screen name="store-owner/manage" options={{ title: "매장 관리" }} />
        </Stack>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
