#!/usr/bin/env node
// PreToolUse(Bash) 가드레일: "eas build" / "eas submit"이 포함된 명령을 감지하면
// 체크리스트를 확인했는지 재확인시키고 강제로 ask 처리한다.
// 목적: EAS 빌드 쿼터(월 15개)를 실수/성급한 빌드로 낭비하지 않기 위함.
let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.exit(0);
  }
  const cmd = (input.tool_input && input.tool_input.command) || "";
  if (!/\beas\s+(build|submit)\b/i.test(cmd)) {
    process.exit(0);
  }
  const reason = [
    "EAS 빌드/제출 쿼터 가드레일 (월 15개 제한):",
    "1) 로컬 빌드(expo run:android / expo run:ios, 쿼터 0)로 먼저 검증했는가?",
    "2) 네이티브 코드/권한 변경이 없어 OTA(eas update)로 대체 가능하지 않은가?",
    "3) eas account:usage로 이번 달 남은 쿼터를 확인했는가?",
    "셋 다 확인했다면 진행하세요.",
  ].join(" ");
  console.log(
    JSON.stringify({
      systemMessage: "⚠️ EAS 빌드 가드레일: 로컬검증 / OTA 대체가능여부 / 쿼터 확인 필요",
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
      },
    }),
  );
});
