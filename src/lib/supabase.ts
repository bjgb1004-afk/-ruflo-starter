import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import type { Database } from "@/types/database.types";

const { supabaseUrl, supabaseAnonKey } = Constants.expoConfig?.extra ?? {};

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수(EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
