import Constants from "expo-constants";

// 오류 기록에 함께 붙일 "어느 앱에서 났는지". errorLog.ts에서 떼어낸 이유는 두 가지다:
// 값 계산에 분기가 있어 테스트가 필요하고, errorLog.ts는 Sentry를 끌어와 테스트에서
// 무겁다(winNotificationText.ts를 떼어 둔 것과 같은 이유).

/**
 * 앱을 켤 때마다 새로 만드는 임시 번호. 기기에 저장하지 않는다 - 다음 실행에서는 다른
 * 값이 되므로 사람을 추적하지 않는다(그래서 Play 데이터 보안 선언을 건드리지 않는다).
 *
 * 쓸모: "한 번의 실행에서 25번 터진 것"과 "25번의 실행에서 한 번씩 터진 것"을 구분한다.
 * "몇 명이 겪는지"는 이걸로 알 수 없다 - 그건 기기에 남는 고정 식별자가 있어야 한다.
 */
const SESSION_ID = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export interface ErrorContext {
  app_version: string | null;
  runtime_version: string | null;
  update_id: string | null;
  session_id: string;
}

/**
 * expo-updates는 개발 빌드·Expo Go에서 꺼져 있고, 최상위 import로 끌어오면 구버전
 * 껍데기에서 번들 로드가 깨질 수 있다(CLAUDE.md의 lazy require 규칙). 그래서 부를 때
 * 가져오고, 실패하면 조용히 null을 준다 - 오류를 기록하려다 또 오류를 내면 안 된다.
 */
function readUpdates(): { runtimeVersion: string | null; updateId: string | null } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require("expo-updates");
    if (!Updates?.isEnabled) return { runtimeVersion: null, updateId: null };
    return {
      runtimeVersion: Updates.runtimeVersion ?? null,
      // 껍데기에 박힌 번들로 돌고 있으면(아직 OTA를 한 번도 안 받은 상태) null이다.
      updateId: Updates.updateId ?? null,
    };
  } catch {
    return { runtimeVersion: null, updateId: null };
  }
}

export function errorContext(): ErrorContext {
  const { runtimeVersion, updateId } = readUpdates();
  return {
    app_version: Constants.expoConfig?.version ?? null,
    runtime_version: runtimeVersion,
    update_id: updateId,
    session_id: SESSION_ID,
  };
}
