import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { initSentry } from "@/lib/sentry";
import { initAnalytics } from "@/lib/analytics";
import { useAuth } from "@/features/auth/useAuth";
import { useFavoritesCloudSync } from "@/features/favorites/useFavoritesCloudSync";
import { colors } from "@/constants/theme";
// 지오펜스 백그라운드 태스크는 앱 로드 시점에 반드시 최상위에서 등록되어야
// OS가 재시작 후 백그라운드에서 앱을 깨울 때도 태스크를 찾을 수 있다.
import "@/features/geofencing/geofenceTask";

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
  }, [initAuth]);

  // 숫자 전용 폰트가 준비되기 전에 화면이 먼저 그려지면 순위/점수 숫자가
  // 시스템 폰트로 한 번 렌더링됐다가 폰트로 바뀌면서 깜빡이므로, 로딩 완료까지 대기한다.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="store/[id]" options={{ title: "판매점 상세" }} />
        <Stack.Screen name="login" options={{ title: "로그인", presentation: "modal" }} />
      </Stack>
    </QueryClientProvider>
  );
}
