import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { reportError } from "@/lib/errorLog";

// 앱 안 의견 창구. 일반 사용자는 로그인이 없어서(관리자만 이메일 로그인) 기기 식별 없이
// 내용만 보낸다. 연락처는 선택 입력이고, 안 적으면 답장은 못 받는다.

export const FEEDBACK_KINDS = ["불편한 점", "아이디어", "오류", "기타"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

// supabase/migrations/20261031000000_add_app_feedback.sql 의 check 제약과 같은 값이어야 한다.
export const FEEDBACK_MIN = 5;
export const FEEDBACK_MAX = 1000;
export const CONTACT_MAX = 100;

// 같은 화면에서 연달아 눌러 도배하는 것을 막는 최소 간격(앱을 다시 켜면 초기화된다).
const COOLDOWN_MS = 30_000;
let lastSentAt = 0;

export function validateFeedback(message: string, contact: string): string | null {
  const m = message.trim();
  if (m.length < FEEDBACK_MIN) return `내용을 ${FEEDBACK_MIN}자 이상 적어주세요.`;
  if (m.length > FEEDBACK_MAX) return `내용은 ${FEEDBACK_MAX}자까지 적을 수 있어요.`;
  if (contact.trim().length > CONTACT_MAX) return `연락처는 ${CONTACT_MAX}자까지 적을 수 있어요.`;
  return null;
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitFeedback(input: {
  kind: FeedbackKind;
  message: string;
  contact: string;
}): Promise<SubmitResult> {
  const invalid = validateFeedback(input.message, input.contact);
  if (invalid) return { ok: false, error: invalid };

  if (Date.now() - lastSentAt < COOLDOWN_MS) {
    return { ok: false, error: "방금 보내주셨어요. 잠시 후에 다시 보내주세요." };
  }

  const contact = input.contact.trim();
  const { error } = await (supabase.from("app_feedback") as any).insert({
    kind: input.kind,
    message: input.message.trim(),
    contact: contact.length > 0 ? contact : null,
    app_version: Constants.expoConfig?.version ?? null,
    platform: Platform.OS,
  });

  if (error) {
    reportError(error, "feedback-submit");
    return { ok: false, error: "보내지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요." };
  }

  lastSentAt = Date.now();
  return { ok: true };
}
