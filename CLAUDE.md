# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is a freshly-initialized **ruflo / claude-flow v3** scaffold (`npx ruflo@latest` was used to set it up). At present the repository contains **no application source code, no `package.json`, no README, and no git history** (`git log` is empty) — only the `.claude/` agent/skill/command configuration, claude-flow v3 runtime state, and MCP wiring described below.

Do not assume there is a buildable/testable app here. There are currently no build, lint, or test commands to run because no source project has been created yet. If the user asks you to run tests/build/lint, check first whether they've since added a project (look for `package.json`, `pyproject.toml`, etc. at the root) — do not invent commands.

When starting real project work in this repo, the first real code added will define its own tooling; update this file at that point with real build/lint/test commands and architecture notes.

## Directory layout

- `.claude/agents/` — Markdown/YAML definitions for specialized subagents (consensus protocols, SPARC phases, swarm coordinators, testing, browser automation). These back the `Agent` tool's `subagent_type` options (e.g. `raft-manager`, `byzantine-coordinator`, `hierarchical-coordinator`, `tdd-london-swarm`).
- `.claude/commands/` — Markdown docs for `claude-flow` CLI command groups (agents, analysis, automation, coordination, github, hive-mind, hooks, memory, monitoring, optimization, swarm, workflows). These describe the `npx claude-flow ...` / `npx ruflo ...` CLI surface, not code in this repo.
- `.claude/skills/` — Skill packages available via the `Skill` tool (AgentDB usage patterns, GitHub automation, SPARC methodology, swarm orchestration, v3 migration/implementation skills, etc.).
- `.claude/helpers/` — Shell/JS/CJS/MJS scripts invoked by the hooks below (`hook-handler.cjs`, `auto-memory-hook.mjs`, `v3.sh`, `statusline.cjs`, `intelligence.cjs`, `memory.js`, `session.js`, `router.js`, and per-domain scripts like `security-scanner.sh`, `ddd-tracker.sh`, `adr-compliance.sh`). `helpers.manifest.json` holds signed hashes for the core hook files.
- `.claude-flow/` — Runtime/state directory for the claude-flow v3 daemon: `agents/`, `sessions/`, `workflows/`, `metrics/` (codebase map, consolidation, performance, security-audit, test-gaps JSON), `policy/state.json`, `daemon-state.json`, `logs/daemon.log`. This is generated/managed state, not hand-authored config.
- `.swarm/` — SQLite-backed swarm memory (`memory.db`, `schema.sql`) used for cross-agent/session memory persistence.
- `ruvector.db` — vector store database used by the AgentDB-related skills.
- `.mcp.json` — registers the `claude-flow` MCP server, launched via `npx -y ruflo@latest mcp start` (autoStart is `false`, so it must be started explicitly or on first tool use).

## Claude Code configuration (`.claude/settings.json`)

- **Hooks are extensively wired**: `PreToolUse`/`PostToolUse` for `Bash` and `Write|Edit|MultiEdit`, plus `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `PreCompact`, `SubagentStart`, `SubagentStop`, and `Notification`. All route through `.claude/helpers/hook-handler.cjs` (falling back to `%USERPROFILE%\.claude\helpers\hook-handler.cjs` if the project-local copy is missing).
- **Session memory sync**: `SessionStart` runs `auto-memory-hook.mjs import`; `Stop` runs `auto-memory-hook.mjs sync` — this is how cross-session memory gets loaded/persisted for the claude-flow learning system, separate from Claude Code's own memory files.
- **Status line**: sourced from `.claude/helpers/statusline.cjs`.
- **Permissions**: `Bash(npx @claude-flow*)`, `Bash(npx claude-flow*)`, `Bash(node .claude/*)`, and `mcp__claude-flow__*` are pre-allowed; `.env`/`.env.*` reads are denied.
- **`claudeFlow` block** configures the v3 runtime: hierarchical-mesh swarm topology capped at 15 agents, hybrid memory backend with HNSW indexing enabled, neural/learning pattern training enabled (short-term 24h / long-term 30d retention), a daemon with `map`/`audit`/`optimize` workers (`autoStart: false`), ADR auto-generation into `/docs/adr` (MADR template), DDD bounded-context tracking into `/docs/ddd`, and security auto-scan/CVE-check on edit.
- Model routing: default model `claude-sonnet-5`, with `claude-haiku-4-5-20251001` used for routing/cheap tasks.

## Working in this repo today

- Because there's no app code yet, most useful actions are through the claude-flow tooling itself: the `Skill` tool (v3-*, agentdb-*, sparc-methodology, swarm-orchestration, etc.), the `Agent` tool with the specialized `subagent_type`s under `.claude/agents/`, and the `claude-flow` MCP server once started.
- `.claude/helpers/v3.sh` is the master CLI for V3 progress tracking (`v3.sh status`, `v3.sh update domain N`, `v3.sh validate`, `v3.sh full-status`) — useful only once actual V3 domain/DDD work begins in this repo.
- If asked to add a real project (app, library, service), scaffold it normally for the requested stack; there is no existing convention to conform to yet.
