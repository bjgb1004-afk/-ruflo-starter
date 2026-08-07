import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { reportError } from "@/lib/errorLog";

export type ShareCardErrorKind = "capture" | "unsupported" | "permission" | "share";

// 캡처 실패/공유 실패/권한 문제/미지원 기기를 구분해서 던진다 - 호출부(mylotto.tsx)가
// 원인별로 다른 안내 문구를 보여줄 수 있도록. 항상 reportError로 Sentry/DB에도 남긴다.
export class ShareCardError extends Error {
  kind: ShareCardErrorKind;
  constructor(kind: ShareCardErrorKind, message: string, cause?: unknown) {
    super(message);
    this.kind = kind;
    this.cause = cause;
  }
}

function isPermissionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return message.includes("permission") || message.includes("denied") || message.includes("권한");
}

// WinningCard(화면 밖에 렌더링된 View)를 이미지로 캡처해 시스템 공유 시트로 넘긴다.
// 각 단계(캡처/기기지원확인/공유)를 개별적으로 try-catch해 실패 지점을 구분한다.
export async function shareWinningCard(cardRef: View): Promise<void> {
  let uri: string;
  try {
    uri = await captureRef(cardRef, { format: "png", quality: 1 });
  } catch (err) {
    reportError(err, "mylotto-share-capture");
    if (isPermissionError(err)) {
      throw new ShareCardError("permission", "기기 권한을 확인해 주세요.", err);
    }
    throw new ShareCardError("capture", "이미지 생성에 실패했습니다.", err);
  }

  let available: boolean;
  try {
    available = await Sharing.isAvailableAsync();
  } catch (err) {
    reportError(err, "mylotto-share-availability");
    // 지원 여부 확인 자체가 실패하면 안전하게 "미지원"으로 취급한다.
    available = false;
  }
  if (!available) {
    throw new ShareCardError("unsupported", "이 기기에서는 공유 기능을 사용할 수 없어요.");
  }

  try {
    await Sharing.shareAsync(uri, { dialogTitle: "당첨 인증 공유하기" });
  } catch (err) {
    reportError(err, "mylotto-share-send");
    if (isPermissionError(err)) {
      throw new ShareCardError("permission", "기기 권한을 확인해 주세요.", err);
    }
    throw new ShareCardError("share", "이미지 생성 또는 공유에 실패했습니다.", err);
  }
}
