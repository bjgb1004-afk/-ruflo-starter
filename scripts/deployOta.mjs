#!/usr/bin/env node
// OTA 배포 + 전달 검증을 한 덩어리로 묶는다.
//
// `eas update`의 성공 출력은 "브랜치에 올라갔다"만 말한다. 유저 폰에 가는지는 채널에
// 찍힌 런타임 표식이 설치된 빌드의 표식과 같은지를 봐야 아는데, 그 확인을 사람 손에
// 맡겨뒀다가 10/21·10/22 두 번 연속 0명에게 가는 배포를 3일 동안 몰랐다.
// 그래서 확인을 생략할 수 없게 같은 명령 안에 넣는다.
//
//   npm run ota -- "메시지"     배포하고 바로 검증
//   npm run ota:verify          지금 채널 상태만 검증
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

// npx/eas.cmd를 직접 spawn하면 Windows + Node 24에서 EINVAL로 죽는다.
// 프로젝트에 깔린 eas-cli의 JS 진입점을 node로 직접 돌려서 셸을 아예 안 거친다.
const EAS = createRequire(import.meta.url).resolve("eas-cli/bin/run");
const run = (args) =>
  execFileSync(process.execPath, [EAS, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
const json = (args) => {
  const out = run([...args, "--json", "--non-interactive"]);
  // eas는 JSON 앞에 버전 안내 같은 잡음을 섞어 내보낸다.
  const start = out.search(/[[{]/);
  if (start < 0) throw new Error(`JSON 응답이 없다: ${args.join(" ")}`);
  return JSON.parse(out.slice(start));
};

const BRANCH = "main"; // production 채널이 보는 브랜치. production이 아니다.

function liveOnChannel() {
  const chan = json(["channel:view", "production"]);
  const branch = chan.currentPage.updateBranches.find((b) => b.name === BRANCH);
  const group = branch?.updateGroups?.[0] ?? [];
  const update = group.find((u) => u.platform === "android") ?? group[0];
  if (!update) throw new Error(`${BRANCH} 브랜치에 업데이트가 없다`);
  return update;
}

function installedBuild() {
  const builds = json([
    "build:list", "--platform", "android",
    "--profile", "production", "--limit", "5",
  ]);
  const build = builds.find((b) => b.status === "FINISHED");
  if (!build) throw new Error("완료된 production 빌드를 못 찾았다");
  const runtime = build.runtime?.version ?? build.fingerprint?.hash;
  if (!runtime) throw new Error("빌드의 런타임 표식을 못 읽었다 (eas-cli 출력 형식 변경?)");
  return { runtime, versionCode: build.appBuildVersion };
}

const verifyOnly = process.argv[2] === "--verify-only";
const message = verifyOnly ? null : process.argv.slice(2).join(" ").trim();

if (!verifyOnly && !message) {
  console.error('메시지가 필요하다:  npm run ota -- "무엇을 바꿨는지"');
  process.exit(2);
}

if (message) {
  console.log(`\n▶ 배포: ${BRANCH} 브랜치, production 환경\n`);
  // --environment 없이 쏘면 Supabase 접속값이 매니페스트에서 빠져 앱이 즉사한다.
  console.log(
    run([
      "update",
      "--branch", BRANCH,
      "--platform", "android",
      "--environment", "production",
      "--message", message,
      "--non-interactive",
    ]),
  );
}

const live = liveOnChannel();
const build = installedBuild();
const match = live.runtime.version === build.runtime;

console.log("\n── 전달 검증 ──");
console.log(`채널에 걸린 것 : ${live.message}`);
console.log(`               ${live.runtime.version}  (${live.createdAt})`);
console.log(`유저 폰의 앱   : versionCode ${build.versionCode}`);
console.log(`               ${build.runtime}`);

if (match) {
  console.log("\n✅ 표식이 같다 — 이 업데이트는 유저에게 간다.");
  console.log(`   실제 수신 인원은 하루쯤 뒤:  npx eas update:insights ${live.group}`);
} else {
  console.error("\n❌ 표식이 다르다 — 이 업데이트는 아무에게도 안 간다.");
  console.error("   app.config.ts의 runtimeVersion을 위 빌드 표식과 같게 맞추고 다시 쏴라.");
  console.error("   (네이티브 부품을 바꿔서 일부러 다르게 둔 거라면, 구버전 유저의");
  console.error("    탈출 경로를 먼저 확인할 것 — CLAUDE.md의 OTA 고립 방지 섹션.)");
  process.exit(1);
}
