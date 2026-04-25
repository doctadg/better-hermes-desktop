# Hermes Desktop — Crush Plan

Date: 2026-04-25 · Goal: feature-parity + decisive lead vs `fathah/hermes-desktop` and `dodo-reach/hermes-desktop`.

## TL;DR strategy

- **Borrow architecture wholesale from fathah** (MIT, our same Electron+React+Tailwind+Zustand stack, 27 slash commands, full screen catalog, FTS5 sessions, electron-updater).
- **Steal the killer differentiators from dodo-reach** (MIT, Swift): SSH-first remote mode, hash-based conflict detection on remote file edits, tabbed terminal workspace, profile-as-first-class context, sophisticated cron builder.
- **Beyond parity** (things neither ships): keep our multi-pane chat (fathah doesn't have it), add saved workspaces, MCP server registry UI, side-by-side model A/B compare, request-gate audit log.
- **Backend is done**: hermes-bridge + hermes-agent expose the full surface (`/v1`, `/api/sessions`, `/api/memory`, `/api/soul`, `/api/skills`, `/api/cron`, `/api/toolsets`, `/api/config`, `/api/gateway/status`). 99% UI work.

## Reference scoreboard

| | fathah v0.2.2 | dodo v0.5.0 | us v0.1.0 |
|---|---|---|---|
| Stars | 383 | 660 | — |
| Cadence | slow (~weekly) | daily | none yet |
| Stack | Electron+React | Swift macOS | Electron+React (us≈fathah) |
| LoC | ~big | ~mid | ~3K |
| Slash commands | 27 | n/a | 0 |
| Model CRUD | ✓ | n/a | ✗ |
| FTS5 sessions | ✓ | ✓ (sqlite read) | ✗ |
| Cron CRUD | ✓ basic | ✓ great builder | ✓ basic |
| Memory editor | ✓ | ✓ | ✓ |
| Persona/Soul | ✓ | ✓ | ✓ |
| Skills mgr | ✓ | ✓ rich | ✓ basic |
| Tools toggles | ✓ | n/a | ✓ ro |
| Gateway mgmt UI | ✓ 15 plats | n/a | ✗ |
| 3D Office | ✓ | n/a | ✗ |
| SSH+terminal | ✗ | ✓ tabbed | ✗ |
| File conflict detect | ✗ | ✓ sha256 | ✗ |
| Auto-updater | ✓ | ✗ | ✗ stub |
| i18n | ✓ en | ✓ en/zh/ru | ✗ |
| Multi-pane chat | ✗ | ✗ | ✓ 1x1/2x1/2x2 |
| Tests | ✓ vitest | ✓ swift | ✗ |
| Multi-profile | ✓ scoped | ✓ first-class | ✓ basic |

## Phases

### Phase 0 — Foundation (one PR, sequential)
1. `git init` + initial commit (project not under VCS)
2. Bump deps: electron 35→39, electron-vite, add `better-sqlite3`, `electron-updater`, `i18next` + `react-i18next`, `react-syntax-highlighter`, `lucide-react`
3. Restructure `electron/` → `src/main/` + `src/preload/` (match fathah layout to make porting clean)
4. SQLite store at `~/.hermes-desktop/cache.db` with `sessions`, `messages`, `messages_fts` (FTS5) tables
5. electron-updater wiring + GitHub publisher in `electron-builder.json5`
6. i18n scaffold with English baseline

### Phase 1 — Feature parity blitz (parallel swarm, ~10 agents)
Each is an independent worktree-style task, run in parallel:

- **A. Slash command system**: 27 commands w/ autocomplete dropdown, keyboard nav, local vs server dispatch, `/help` / `/usage` / `/model` / `/memory` etc. (port from fathah `Chat.tsx:30-122` and `Chat.tsx:244-261`)
- **B. CRUD Model selector**: full Models screen + add/edit/delete modal, provider preset list (10+ providers), search, integrate with chat picker (port `Models.tsx`)
- **C. Sessions screen**: FTS5 search, date-grouped (Today/Yesterday/This Week/Earlier), pagination, delete (port `Sessions.tsx` + `sessions.ts` SQL)
- **D. Settings expansion**: 10-section layout (Hermes info, Connection, Appearance, Network, Model, Credential pool, Data backup, Logs, API keys env, Gateways) (port `Settings.tsx`)
- **E. Memory editor++**: capacity bars (green/orange/red), entries CRUD with `\n§\n` delimiter, providers tab w/ Honcho/Hindsight/Mem0/RetainDB/Supermemory/ByteRover discovery
- **F. Skills manager**: list installed + bundled, install/uninstall, edit SKILL.md inline (steal dodo's hash-conflict editor), category filter
- **G. Tools toggles**: toolset enable/disable per profile, MCP server registry UI (we go further than fathah here)
- **H. Cron builder**: port dodo's bidirectional preset↔cron parser to TS (this is the standout; way better than fathah's basic form)
- **I. Gateway mgmt**: 15 platforms (Telegram/Discord/Slack/WhatsApp/Signal/Matrix/Mattermost/Email/SMS/iMessage/DingTalk/Feishu/WeCom/WeChat/Webhooks/HomeAssistant) — env-var inputs, enable/disable, status indicator
- **J. Persona (Soul) editor**: hash-based conflict-aware editor (better than fathah's plain editor)

### Phase 2 — Differentiators (parallel swarm, ~5 agents)
- **K. SSH terminal tabs**: xterm.js + node-pty + ssh2 (or spawn system ssh), tabbed workspace, theme presets (System/Graphite/Evergreen/Dusk/Paper/Custom + live RGB picker) — straight from dodo
- **L. No-mirror file edits**: SHA-256 hash on read, conflict detection on save, atomic temp+rename — applies to MEMORY.md/USER.md/SOUL.md/SKILL.md
- **M. Auto-updater wired**: GitHub releases, signed/notarized later, update-available toast in app
- **N. Token/cost tracking**: live footer in chat (prompt+completion tokens, cost when available), `/usage` slash, session totals
- **O. Backup/import + debug dump + log viewer**: tar.gz export, drag-drop import, last-300-line tail of agent.log/gateway.log/error.log

### Phase 3 — Beyond parity (parallel swarm, ~4 agents)
Things neither competitor ships:
- **P. Saved workspaces**: name + persist a multi-pane layout (e.g. "Code review = chat | sessions | terminal"), reload via Cmd+\d
- **Q. Model A/B compare**: open two panes, send same prompt, diff token counts + latency + output side-by-side
- **R. Request-gate audit log**: log every approval/clarify/sudo/secret request with timestamp + user decision; searchable history (security/compliance angle)
- **S. Native dark/light/system theme + accent color picker**: fathah is dark-only; we ship full theme system

### Phase 4 — Ship
- Multi-platform build (mac DMG arm64+x64, linux AppImage+deb, windows nsis+zip)
- Smoke test golden paths in dev electron
- Tag v0.2.0, push to a fresh GitHub repo, `gh release create` with all 8+ artifacts
- README rewrite with feature table + screenshots

## What I need from you to start

1. **Scope sign-off**: ship Phase 0+1+2+4 first (parity + differentiators + release), then Phase 3 in a v0.3? Or all-in-one v0.2 mega-drop?
2. **GitHub repo**: do you have a target org/owner? (Need it for `electron-builder.json5` publish config and the eventual `gh release`.)
3. **Platforms**: all three (mac/linux/win) or mac-only first?
4. **Code-signing**: skip for v0.2 alpha (current state, same as fathah/dodo's first releases) and add in v0.3 when paid certs ready?
5. **License**: MIT to match the ecosystem? Confirm?

After sign-off I `git init`, do Phase 0 sequentially in this conversation, then unleash 10+ parallel agents on Phase 1 in worktrees so we don't trample. Phase 2 right after. Then ship.
