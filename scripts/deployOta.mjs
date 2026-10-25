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

// 한 브랜치는 런타임 표식이 다른 업데이트를 동시에 품을 수 있고, EAS는 기기마다
// "그 기기의 표식에 맞는 가장 최신 것"을 내려준다. 그래서 "맨 위 업데이트가 내 표식인가"를
// 물으면 안 된다 - 구버전 구조용으로 옛 표식에 한 번 쏘는 순간 멀쩡한 배포가 실패로 보인다
// (2026-10-25에 실제로 그렇게 오보했다). 설치된 빌드의 표식에 맞는 최신 것을 찾아야 한다.
function updatesOnBranch() {
  const list = json(["update:list", "--branch", BRANCH, "--limit", "20"]);
  const groups = list.currentPage ?? [];
  if (groups.length === 0) throw new Error(`${BRANCH} 브랜치에 업데이트가 없다`);
  return groups.filter((g) => String(g.platforms ?? "").includes("android"));
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

const updates = updatesOnBranch();
const build = installedBuild();
// 유저 폰에 실제로 내려가는 것: 설치된 빌드의 표식과 같은 표식의 최신 업데이트.
const delivered = updates.find((u) => u.runtimeVersion === build.runtime);

console.log("\n── 전달 검증 ──");
console.log(`유저 폰의 앱   : versionCode ${build.versionCode}`);
console.log(`               ${build.runtime}`);

if (delivered) {
  console.log(`그 폰에 갈 것  : ${delivered.message}`);
  console.log("\n✅ 설치된 빌드의 표식에 맞는 업데이트가 올라가 있다 — 유저에게 간다.");
  console.log(`   실제 수신 인원은 하루쯤 뒤:  npx eas update:insights ${delivered.group}`);
} else {
  console.error("\n❌ 설치된 빌드의 표식에 맞는 업데이트가 없다 — 아무에게도 안 간다.");
  console.error("   app.config.ts의 runtimeVersion을 위 빌드 표식과 같게 맞추고 다시 쏴라.");
  process.exit(1);
}

// 다른 표식에 올라간 것들도 같이 보여준다 - 구버전 구조 배포가 살아 있는지 확인용이고,
// 실수로 엉뚱한 표식에 쏜 것도 여기서 눈에 걸린다.
const others = [...new Set(updates.map((u) => u.runtimeVersion))].filter(
  (rt) => rt !== build.runtime,
);
if (others.length > 0) {
  console.log(`\n   이 브랜치의 다른 표식: ${others.join(", ")}`);
  console.log("   (구버전 구조용이면 정상 - 그 표식의 기기만 받는다)");
}
