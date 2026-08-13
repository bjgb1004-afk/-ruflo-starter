import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  initialized: boolean;
  init: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
}

export const useAuth = create<AuthState>()((set) => ({
  session: null,
  user: null,
  isLoading: true,
  initialized: false,

  init: () => {
    // 여러 화면에서 useAuth를 호출해도 리스너는 앱 전체에서 한 번만 등록되도록
    // app/_layout.tsx의 최상위 effect에서 한 번만 호출한다.
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, isLoading: false, initialized: true });
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, isLoading: false });
    });
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  deleteAccount: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.access_token) {
      return { error: "로그인이 필요합니다." };
    }

    const { error } = await supabase.functions.invoke("delete-account", {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    });

    if (error) return { error: error.message ?? "탈퇴 처리 중 오류가 발생했습니다." };

    await supabase.auth.signOut();
    return { error: null };
  },
}));
