// React Native 환경에서만 URL 폴리필이 필요 (웹은 기본 URL API 사용)
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import type { Database } from "@/types/database.types";

if (typeof window === "undefined") {
  try {
    require("react-native-url-polyfill/auto");
  } catch (e) {
    // 폴리필이 없으면 무시 (웹 환경에서는 필요 없음)
  }
}

const { supabaseUrl, supabaseAnonKey } = Constants.expoConfig?.extra ?? {};

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수(EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// RN 앱은 탭에 포커스가 없어도 백그라운드에서 계속 실행되므로, 앱이 활성 상태일 때만
// 토큰 자동 갱신 타이머를 돌려야 한다 (Supabase RN 공식 권장 패턴).
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
