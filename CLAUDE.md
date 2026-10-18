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
npx eas update --branch main    --platform android --environment production --message "..."
npx eas update --branch preview --platform android --environment preview    --message "..."
```

- `--environment`를 빼면 Supabase 접속값이 매니페스트에서 빠져 앱이 시작하자마자 죽는다(과거 2회 발생).
- 배포 후 **반드시** `npx eas channel:view production`으로 그 업데이트가 실제로 채널에 걸렸는지 확인한다.
  브랜치에 올라간 것만으로는 유저에게 안 간다.
- 로컬 번들링이 메모리 부족으로 죽으면: `eas env:exec <env> "npx expo export --platform android --max-workers 1 --output-dir dist --clear"` →
  번들 안 환경변수 확인 → `eas update --skip-bundler --input-dir dist`.

## 네이티브 부품을 바꾸는 빌드 전에 (OTA 고립 방지)

`runtimeVersion`은 `fingerprint` 정책이라, **네이티브 의존성이 바뀌면 런타임 지문이 갈라지고
구버전 기기는 그 이후 어떤 OTA도 못 받는다.** 이건 안전장치지 버그가 아니다(없는 네이티브
부품을 부르는 JS가 내려가면 앱이 즉사한다). 다만 고립된 유저를 빼낼 사다리를 미리 놔야 한다:

1. **부품을 바꾸기 전에**, 순수 JS 안내 배너("스토어에서 업데이트 해주세요")를 **현재 런타임에**
   OTA로 먼저 배포한다. JS만이라 구버전도 받는다.
2. 그 다음 네이티브 변경 빌드를 올린다.
3. 그 빌드에 한해 `src/lib/inAppUpdate.ts`의 `IAUUpdateKind.FLEXIBLE` → `IMMEDIATE`로 바꾼다.
   FLEXIBLE은 유저가 무시할 수 있어, 정말 고립되는 전환에선 빠져나오지 못한다.

(2026-10-13 vc2→vc3 전환 때 1·3번을 안 해서 구버전 유저에게 탈출 경로가 없었다.
실제 피해자는 0명이었음 — `eas update:insights <groupId>`로 확인 가능.)

## EAS Build Quota Management (Critical)

**Context**: Free plan has only 15 Android builds/month. One command-line error wastes 1 quota immediately (past incident: typo in `--type` flag caused 2-week wait).

**MANDATORY Pre-Build Checklist** (NEVER skip, NEVER rush):

1. ✅ All commits pushed to GitHub (`git push` first)
2. ✅ app.config.ts validated (name, version, versionCode, permissions, icons)
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
