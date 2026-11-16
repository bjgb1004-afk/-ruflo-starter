import { Linking } from "react-native";
import * as Updates from "expo-updates";
import { reportError } from "@/lib/errorLog";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

export type AppUpdateGate = Database["public"]["Tables"]["app_update_gates"]["Row"];

/**
 * 설치된 앱 껍데기의 런타임 표식. OTA 번들이 아니라 바이너리에서 읽히는 값이라,
 * 번들을 몇 번 갈아끼워도 변하지 않는다 - 그래서 "이 폰이 어떤 껍데기인가"의 신원이 된다.
 *
 * 개발 빌드/Expo Go에서는 expo-updates가 꺼져 있어 null을 준다. 그 경우 조회 자체를
 * 안 해서 개발 중에 안내가 뜨는 일은 없다.
 */
export function installedRuntime(): string | null {
  if (!Updates.isEnabled) return null;
  return Updates.runtimeVersion ?? null;
}

/**
 * 내 표식에 해당하는 안내가 있는지만 묻는다. 없으면 null - 즉 평소에는 아무 일도
 * 일어나지 않고, 서버에 줄을 넣은 순간에만 안내가 뜬다.
 *
 * 표식이 일치하는 줄만 가져오므로, 최신 껍데기를 쓰는 유저는 서버에 줄이 몇 개
 * 쌓여 있어도 영향을 받지 않는다.
 */
export async function getUpdateGate(runtimeVersion: string): Promise<AppUpdateGate | null> {
  const { data, error } = await supabase
    .from("app_update_gates")
    .select("*")
    .eq("runtime_version", runtimeVersion)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const PLAY_STORE_URL = "market://details?id=com.gzc.lottomap";
export const PLAY_STORE_WEB_URL =
  "https://play.google.com/store/apps/details?id=com.gzc.lottomap";

/**
 * 이 앱의 Play 스토어 페이지를 연다. market:// 이 열리지 않는 기기(스토어 미설치/
 * 사이드로드)에서는 웹 주소로 떨어진다.
 *
 * 고립 안내(UpdateGate)와 설정의 "별점 남기기"가 같은 동작을 쓴다 - 떨어뜨리는 순서가
 * 한쪽에만 들어가 있으면 일부 기기에서 버튼이 아무 일도 안 하는 것처럼 보인다.
 */
export function openPlayStore(context: string) {
  Linking.openURL(PLAY_STORE_URL).catch(() =>
    Linking.openURL(PLAY_STORE_WEB_URL).catch((err) => reportError(err, context)),
  );
}
