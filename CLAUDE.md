# CLAUDE.md

> Workflow Orchestration / Task Management / Core Principles(Boris Cherny 워크플로우)는 전역 설정(`~/.claude/CLAUDE.md`)으로 옮겨져 모든 프로젝트에 공통 적용됩니다. 이 파일은 이 프로젝트 전용 컨텍스트만 담습니다.

## Project Context

This repo holds **복권명당** (`com.gzc.lottomap`), a shipped Expo/React Native Android app on the Play Store — a lotto store map, number generator, and winnings tracker backed by Supabase. Source lives in `app/` (expo-router screens) and `src/features/*`; the backend is `supabase/migrations/` plus `scripts/ingest/*`.

Typecheck with `npx tsc --noEmit -p .`. The `.claude/`, `.claude-flow/`, `.swarm/` and `ruvector.db` entries described below are leftover scaffolding from `npx ruflo@latest`, not part of the app.

### Directory Layout

- `.claude/agents/` — Markdown/YAML definitions for specialized subagents (consensus protocols, SPARC phases, swarm coordinators, testing, browser automation). These back the `Agent` tool's `subagent_type` options (e.g. `raft-manager`, `byzantine-coordinator`, `hierarchical-coordinator`, `tdd-london-swarm`).
- `.claude/commands/` — Markdown docs for `claude-flow` CLI command groups (agents, analysis, automation, coordination, github, hive-mind, hooks, memory, monitoring, optimization, swarm, workflows). These describe the `npx claude-flow ...` / `npx ruflo ...` CLI surface, not code in this repo.
- `.claude/skills/` — Skill packages available via the `Skill` tool (AgentDB usage patterns, GitHub automation, SPARC methodology, swarm orchestration, v3 migration/implementation skills, etc.).
- `.claude/helpers/` — Shell/JS/CJS/MJS scripts invoked by the hooks below (`hook-handler.cjs`, `auto-memory-hook.mjs`, `v3.sh`, `statusline.cjs`, `intelligence.cjs`, `memory.js`, `session.js`, `router.js`, and per-domain scripts like `security-scanner.sh`, `ddd-tracker.sh`, `adr-compliance.sh`). `helpers.manifest.json` holds signed hashes for the core hook files.
- `.claude-flow/` — Runtime/state directory for the claude-flow v3 daemon: `agents/`, `sessions/`, `workflows/`, `metrics/` (codebase map, consolidation, performance, security-audit, test-gaps JSON), `policy/state.json`, `daemon-state.json`, `logs/daemon.log`. This is generated/managed state, not hand-authored config.
- `.swarm/` — SQLite-backed swarm memory (`memory.db`, `schema.sql`) used for cross-agent/session memory persistence.
- `ruvector.db` — vector store database used by the AgentDB-related skills.
- `.mcp.json` — registers the `claude-flow` MCP server, launched via `npx -y ruflo@latest mcp start` (autoStart is `false`, so it must be started explicitly or on first tool use).

### Claude Code Configuration (`.claude/settings.json`)

- **Hooks are extensively wired**: `PreToolUse`/`PostToolUse` for `Bash` and `Write|Edit|MultiEdit`, plus `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `PreCompact`, `SubagentStart`, `SubagentStop`, and `Notification`. All route through `.claude/helpers/hook-handler.cjs` (falling back to `%USERPROFILE%\.claude\helpers\hook-handler.cjs` if the project-local copy is missing).
- **Session memory sync**: `SessionStart` runs `auto-memory-hook.mjs import`; `Stop` runs `auto-memory-hook.mjs sync` — this is how cross-session memory gets loaded/persisted for the claude-flow learning system, separate from Claude Code's own memory files.
- **Status line**: sourced from `.claude/helpers/statusline.cjs`.
- **Permissions**: `Bash(npx @claude-flow*)`, `Bash(npx claude-flow*)`, `Bash(node .claude/*)`, and `mcp__claude-flow__*` are pre-allowed; `.env`/`.env.*` reads are denied.
- **`claudeFlow` block** configures the v3 runtime: hierarchical-mesh swarm topology capped at 15 agents, hybrid memory backend with HNSW indexing enabled, neural/learning pattern training enabled (short-term 24h / long-term 30d retention), a daemon with `map`/`audit`/`optimize` workers (`autoStart: false`), ADR auto-generation into `/docs/adr` (MADR template), DDD bounded-context tracking into `/docs/ddd`, and security auto-scan/CVE-check on edit.
- Model routing: default model `claude-sonnet-5`, with `claude-haiku-4-5-20251001` used for routing/cheap tasks.

### Working in This Repo Today

- Because there's no app code yet, most useful actions are through the claude-flow tooling itself: the `Skill` tool (v3-*, agentdb-*, sparc-methodology, swarm-orchestration, etc.), the `Agent` tool with the specialized `subagent_type`s under `.claude/agents/`, and the `claude-flow` MCP server once started.
- `.claude/helpers/v3.sh` is the master CLI for V3 progress tracking (`v3.sh status`, `v3.sh update domain N`, `v3.sh validate`, `v3.sh full-status`) — useful only once actual V3 domain/DDD work begins in this repo.
- If asked to add a real project (app, library, service), scaffold it normally for the requested stack; there is no existing convention to conform to yet.

## OTA 배포 (매번 이 순서 그대로)

**채널과 브랜치는 이름이 다르다.** `production` 채널이 보는 브랜치는 **`main`**이다.
`--branch production`으로 올리면 아무 기기에도 안 간다(2026-09-03/09-23/10-13/10-18, 네 번 반복한 실수).

```bash
npm run ota -- "무엇을 바꿨는지"
```

이 명령이 위 플래그를 다 박아서 쏘고, **쏜 뒤 전달 검증까지 같이 한다**(채널에 찍힌 런타임
표식 vs 설치된 빌드의 표식). 표식이 다르면 큰 소리로 실패한다 — 10/21·10/22에 아무에게도
안 가는 배포를 3일 동안 몰랐던 게 이 확인을 사람 손에 맡겨뒀기 때문이다.
지금 상태만 보려면 `npm run ota:verify`. 날것으로 쏠 일이 있으면:

```bash
npx eas update --branch main --platform android --environment production --message "..."
```

- `--environment`를 빼면 Supabase 접속값이 매니페스트에서 빠져 앱이 시작하자마자 죽는다(과거 2회 발생).
- 배포 후 **반드시** `npx eas channel:view production`으로 그 업데이트가 실제로 채널에 걸렸는지 확인한다.
  브랜치에 올라간 것만으로는 유저에게 안 간다. **채널에 찍힌 Runtime Version이 설치된 빌드의
  것과 같은지도 같이 본다** — 다르면 올라가긴 했어도 아무 기기에도 안 간다.
  빌드 쪽 값은 `npx eas build:list --platform android --limit 5`의 `Runtime Version`.
- **preview 배포는 지금 의미가 없다(2026-10-22 이후).** `runtimeVersion`을 production 빌드의
  지문(`ba19255c…`)으로 못박았는데 preview 빌드의 지문은 `7225e6e4…`로 달라서, preview에 쏘면
  preview 앱이 자기 것으로 못 본다. 쏴도 아무에게도 안 가는 헛배포다. preview를 되살리려면
  preview 빌드를 새로 만들고 그 지문을 확인해야 한다.
- 로컬 번들링이 메모리 부족으로 죽으면: `eas env:exec <env> "npx expo export --platform android --max-workers 1 --output-dir dist --clear"` →
  번들 안 환경변수 확인 → `eas update --skip-bundler --input-dir dist`.
- **번들링 중에는 앱 소스를 고치지 말 것.** Metro가 의존성 그래프를 만들며 파일을 읽는 중이라,
  중간에 바뀐 파일이 섞이면 "모듈을 못 찾는" 번들이 올라가 앱이 즉사할 수 있다. 번들링이 느린
  이유는 보통 메모리 부족이니, 급하면 위 `--max-workers 1` 경로로 다시 시작하는 게 낫다.
  (번들링 중에 새 파일을 **추가**하는 것은 안전하다 — 아무도 import하지 않으므로 번들에 안 들어간다.)

## 네이티브 부품을 바꾸는 빌드 전에 (OTA 고립 방지)

**`runtimeVersion`은 2026-10-22부터 자동계산(`fingerprint`)이 아니라 손으로 적은 고정값이다**
(`app.config.ts`, 현재 `ba19255c…` = versionCode 3 production 빌드의 지문). 자동계산이 껍데기가
안 바뀌었는데도 저절로 달라져서 10/21 배포가 **0명**에게 갔기 때문이다(10/18은 28명).
그래서 **네이티브 부품을 바꾸는 빌드를 할 때는 이 값을 반드시 같이 바꿔야 한다.** 안 바꾸면
없는 네이티브 부품을 부르는 JS가 구버전 기기로 내려가 앱이 즉사한다(2026-10-03 사고).
읽기 쉬운 값("4" 같은 것)으로 바꿔도 된다 — 새 빌드부터는 어차피 새 표식이기 때문이다.

런타임 표식이 갈라지면 **구버전 기기는 그 이후 어떤 OTA도 못 받는다.** 이건 안전장치지
버그가 아니다.

### 고립 탈출은 서버 한 줄로 한다 (2026-10-25부터)

`app_update_gates` 표에 **그 구버전의 런타임 표식**을 한 줄 넣으면, 그 표식을 가진 앱에만
"스토어에서 업데이트" 전체화면이 뜬다. 앱은 열 때마다 어차피 Supabase에 접속하므로
OTA를 못 받는 폰에서도 이 조회만은 도착한다 — 배포도, 빌드도 필요 없다.

```sql
insert into public.app_update_gates (runtime_version, title, message) values
  ('1.0.0', '업데이트가 필요합니다', '새 기능을 쓰려면 스토어에서 최신 버전을 받아주세요.');
```

줄을 지우면 안내도 사라진다. **줄이 없으면 아무 일도 안 일어난다** — 새 빌드를 내고 이 줄을
넣는 걸 잊어도 최악이 "안내가 안 뜬다"일 뿐이다(옛 방식처럼 멀쩡한 유저를 막는 사고가
구조적으로 불가능하다). 구현은 `src/features/appUpdate/`.

**이게 동작하려면 번들이 양쪽 껍데기에서 다 떠야 한다.** 그래서 네이티브 모듈은 최상위
import가 아니라 호출 시점 `require`로 가져온다(`src/lib/inAppUpdate.ts`,
`src/features/ads/*`). 새 네이티브 의존성을 쓸 때도 이 규칙을 지킬 것 — 최상위에서
import하면 구버전 폰에서 번들 로드 자체가 실패해 앱이 즉사하고, 그러면 탈출 안내도 못 뜬다.

### 그래서 네이티브 빌드 전 점검은 두 줄이면 끝난다

1. 새 네이티브 의존성을 **최상위 import로 쓰지 않았는지** (위 규칙)
2. 빌드 후, 구버전 표식을 `app_update_gates`에 넣기 (지금 유저가 쓰는 표식은
   `npm run ota:verify` 출력의 "유저 폰의 앱" 줄)

(2026-10-13 vc2→vc3 전환 때는 이 장치가 없어서 구버전 유저에게 탈출 경로가 아예 없었다.
당시 탈출 안내를 **새 빌드에** 넣는 실수를 했다 — 안내가 필요한 쪽은 못 받는 쪽이다.
약 10%가 그렇게 남았다. 경과는 `tasks/lessons.md` 참고.)

## EAS Build Quota Management (Critical)

**Context**: Free plan has only 15 Android builds/month. One command-line error wastes 1 quota immediately (past incident: typo in `--type` flag caused 2-week wait).

**MANDATORY Pre-Build Checklist** (NEVER skip, NEVER rush):

1. ✅ All commits pushed to GitHub (`git push` first)
2. ✅ app.config.ts validated (name, version, versionCode, permissions, icons)
2-1. ✅ **네이티브 부품(의존성·patches·android/·google-services.json)을 바꿨다면
     `runtimeVersion`도 같이 올렸는지** — 위 "네이티브 부품을 바꾸는 빌드 전에" 참고.
     안 올리면 구버전 기기가 받으면 안 되는 JS를 받아 즉사한다. 빌드 후에는
     `eas build:list`의 `Runtime Version`이 적어둔 값과 같은지 확인한다.
3. ✅ .env file has all required vars (SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_MAPS_API_KEY_ANDROID)
4. ✅ node_modules installed (870+ packages)
5. ✅ TypeScript check passes (`npm run typecheck`)
6. ✅ Android native config valid (build.gradle, gradle.properties, etc.)
7. ✅ eas.json has correct build profiles (production = AAB, production-samsung = APK)
8. ✅ Visual assets exist (icon.png, splash.png, adaptive-icon.png)
9. **[CRITICAL] ✅ Test the EXACT build command FIRST**:
   - `npx eas build --help` → verify correct flags
   - Do NOT copy-paste commands from memory or docs
   - Test with `npx eas build --platform android` (interactive mode) BEFORE production build
10. ✅ Current quota confirmed: `npx eas account:usage bjgbs-team`
11. ✅ ALL above items marked ✅ before executing production build

**Production Build Command** (only after ALL 11 items pass):
```bash
npx eas build --platform android
# Select "production" profile when prompted
```

**Why This Is Non-Negotiable**:
- 15 builds/month = ~0.5/day
- One command-line error = 2 weeks of waiting
- No recovery: quota expires, cannot be rolled over
- Typos in flags (`--type`, `--profile`, `-p`, etc.) fail fast and burn quota
