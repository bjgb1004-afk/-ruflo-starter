import { useEffect } from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initSentry } from "@/lib/sentry";
import { initAnalytics } from "@/lib/analytics";

const queryClient = new QueryClient();

export default function RootLayout() {
  useEffect(() => {
    initSentry();
    initAnalytics();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="store/[id]" options={{ title: "판매점 상세" }} />
      </Stack>
    </QueryClientProvider>
  );
}
