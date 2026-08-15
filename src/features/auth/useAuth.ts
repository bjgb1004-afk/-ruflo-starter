import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useFavorites } from "@/features/favorites/useFavorites";
import { useSelectedStores } from "@/features/geofencing/useSelectedStores";
import { stopGeofencingCompletely } from "@/features/geofencing/useGeofencing";
import { reportError } from "@/lib/errorLog";

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
    await clearLocalUserState();
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
    await clearLocalUserState();
    return { error: null };
  },
}));

// 즐겨찾기/명당알림 선택은 기기 로컬(AsyncStorage)에 저장되고 계정으로 구분되지 않는다.
// 로그아웃 없이 이 상태를 남겨두면, 같은 기기에서 다른 계정으로 로그인했을 때
// useFavoritesCloudSync가 이전 사용자의 로컬 즐겨찾기를 "게스트가 추가한 것"으로 오인해
// 새 계정의 클라우드로 밀어넣고(계정 간 데이터 유출), 명당알림도 새 계정의 무료 한도를
// 무시한 채(이전 선택 그대로) 계속 발동한다. 로그아웃/탈퇴 시점에 전부 비워 다음 로그인이
// 항상 깨끗한 상태(또는 진짜 비로그인 게스트 상태)에서 시작하게 한다.
async function clearLocalUserState(): Promise<void> {
  try {
    useFavorites.setState({ stores: {}, pendingDeletes: [] });
    useSelectedStores.setState({ stores: {} });
    await stopGeofencingCompletely();
  } catch (err) {
    reportError(err, "auth-clear-local-state");
  }
}
