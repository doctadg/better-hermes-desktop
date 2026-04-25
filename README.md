<p align="center">
  <a href="https://github.com/doctadg/better-hermes-desktop"><img src="https://img.shields.io/badge/version-v0.2.0-FFD700?style=for-the-badge" alt="v0.2.0"></a>
  <a href="https://github.com/doctadg/better-hermes-desktop/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT"></a>
  <a href="https://github.com/doctadg/better-hermes-desktop/releases"><img src="https://img.shields.io/badge/Download-Releases-FF6600?style=for-the-badge" alt="Releases"></a>
</p>

# Hermes Desktop

A local-first AI agent companion. **Multi-pane chat. Full slash-command arsenal. Model CRUD. FTS5 session search. Conflict-aware remote file editing. 16-platform gateway management. Saved workspaces. Side-by-side model A/B compare. Request-gate audit log.**

> **v0.2.0 alpha.** Active development. Things may change. Issues welcome.

This client talks to [Hermes Agent](https://github.com/NousResearch/hermes-agent) over its OpenAI-compatible HTTP API (with optional [hermes-bridge](https://github.com/doctadg/hermes-bridge) profile-multiplexing in front of it). Local-first design: SQLite cache for sessions and messages, no required cloud account, all preferences and saved workspaces persist on disk.

## Install

Grab a build from the [Releases page](https://github.com/doctadg/better-hermes-desktop/releases).

| Platform | File | Size | Notes |
|---|---|---|---|
| Windows | `Hermes Desktop-0.2.0-portable.exe` | 81 MB | Single-file portable, no installer |
| Windows | `Hermes Desktop-0.2.0-win-x64.zip`  | 123 MB | Unpacked folder |
| macOS   | (coming in v0.2.x) | — | DMG, arm64 + x64, unsigned |
| Linux   | (coming in v0.2.x) | — | AppImage + deb |

> No code signing for v0.2 alpha. Windows SmartScreen will warn on first launch — click "More info" → "Run anyway."

## Features (16 nav screens)

- **Chat** — Multi-pane chat (1×1 / 2×1 / 2×2 grids), SSE token streaming, tool-progress indicators, request-gates (approval / clarify / sudo / secret), markdown + syntax highlighting
- **Sessions** — FTS5 full-text search across every message you've ever sent. Date-grouped browsing (Today / Yesterday / This Week / Earlier). One-click sync from server.
- **Models** — CRUD model library with 15 provider presets: OpenRouter, Anthropic, OpenAI, Google, xAI, Nous Research, Qwen, MiniMax, HuggingFace, Groq, LM Studio, Ollama, vLLM, llama.cpp, custom. Search, group-by-provider, inline-confirm delete.
- **A/B Compare** — Synchronized dual-pane chat. Pick two models, send the same prompt to both, watch latency / tokens / cost side-by-side in real time.
- **Memory** — 3-tab editor (Entries / Profile / Providers) with capacity bars colored by usage ratio. Hash-based conflict detection on save: refetch + sha256 compare; if the server moved, you get a "reload or force overwrite" modal instead of silently clobbering. 6 memory provider catalogue (Honcho, Hindsight, Mem0, RetainDB, Supermemory, ByteRover).
- **Persona** — `SOUL.md` editor with the same hash-conflict pattern. YAML frontmatter detection. Tracks dirty state with an unsaved-changes dot.
- **Skills** — Browse installed and bundled skills. Category filter, search. Conflict-aware `SKILL.md` editor.
- **Tools** — Toolset toggles + an MCP server registry (CRUD spawn configs, stored locally; full spawn lands in v0.3).
- **Editor / Diff** — CodeMirror-based code editor with file tree and side-by-side diff viewer.
- **Schedules** — Bidirectional preset↔cron parser. Pick a shape (one-time / interval / hourly / daily / weekdays / weekly / monthly / custom-cron), the parser round-trips both directions. Pure TS, zero deps.
- **Gateways** — 16 messaging platforms with status pills and per-platform env-var editor: Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Mattermost, Email, SMS, iMessage, DingTalk, Feishu, WeCom, WeChat, Webhooks, Home Assistant.
- **Workspaces** — Save and restore named multi-pane layouts. The whole pane grid + session bindings as one named snapshot. QuickSwitcher in the top bar.
- **Audit** — Browse the local audit trail of every approval / clarify / sudo / secret request the agent has surfaced and how the user responded. Filter by kind, search by request id / session id / payload, expand to see pretty-printed JSON. (Sudo and secret payloads are metadata-only; raw passwords and secret values are never persisted.)
- **Hardware** — Live CPU / memory / disk / network info dashboard.
- **Network** — Local network device discovery.
- **Settings** — 10 sections: About, Connection, Appearance (theme + accent picker), Network (proxy), Default Model, Updates (electron-updater + GitHub releases), Data (export/import backup), Logs (renderer console ring buffer), Shortcuts reference, Danger zone.

## Plus

- **27 slash commands** — `/new`, `/clear`, `/btw`, `/approve`, `/deny`, `/status`, `/reset`, `/compact`, `/undo`, `/retry`, `/fast`, `/compress`, `/usage`, `/debug`, `/web`, `/image`, `/browse`, `/code`, `/file`, `/shell`, `/help`, `/tools`, `/skills`, `/model`, `/memory`, `/persona`, `/version` — registry built; input wiring lands in v0.2.x
- **Token / cost tracker** — per-session Zustand store with `persist`, normalises both snake_case and camelCase usage shapes from the server
- **Auto-updater** — electron-updater wired to GitHub releases
- **i18n scaffold** — react-i18next, English baseline, ready for community translations
- **System tray** — show / quit menu

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + K` | Command palette |
| `Cmd/Ctrl + T` | New chat session |
| `Cmd/Ctrl + B` | Toggle sidebar |
| `Cmd/Ctrl + Shift + P` | Toggle context panel |
| `Cmd/Ctrl + Shift + F` | Sessions search (FTS5) |
| `F12` | Devtools |

## Backend

This client is a UI for the Hermes Agent. It does not ship the agent itself. Spin up the backend separately:

```sh
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent && ./setup-hermes.sh
hermes  # default API on http://localhost:8642
```

Optional: put [hermes-bridge](https://github.com/doctadg/hermes-bridge) in front for profile-multiplexed routing across multiple Hermes hosts.

## Development

```sh
git clone https://github.com/doctadg/better-hermes-desktop.git
cd better-hermes-desktop
npm install
npm run electron:dev   # vite + electron concurrently

# Builds
npm run electron:build:win    # NSIS portable + zip
npm run electron:build:mac    # DMG arm64+x64 + zip
npm run electron:build:linux  # AppImage + deb
```

Stack: Electron 35 · React 19 · Vite 6 · Zustand 5 · Tailwind 4 · better-sqlite3 (FTS5) · electron-updater · i18next · CodeMirror 6.

## Architecture

```
electron/
├── main.ts              # frameless window, single-instance lock, system tray
├── preload.ts           # contextBridge → window.hermesAPI
├── ipc-handlers.ts      # 30+ IPC channels
├── db.ts                # SQLite + FTS5 schema (sessions, messages, models,
│                       #   workspaces, audit_log)
├── updater.ts           # electron-updater wiring
└── paths.ts             # ~/.hermes resolution

src/
├── api/                 # HTTP/SSE client for /v1/* and /api/* endpoints
├── stores/              # Zustand stores (chat, connection, layout)
├── components/          # chat panes, sidebar, layout, connection picker
└── features/            # one folder per nav screen, each with INTEGRATION.md
    ├── audit/           ├── memory/         ├── soul/
    ├── compare/         ├── models/         ├── tools/
    ├── cron/            ├── sessions/       ├── usage/
    ├── editor/          ├── settings/       └── workspaces/
    ├── gateways/        └── skills/
    └── slash/
```

## Credits

Borrows architecture and design ideas from two prior MIT-licensed Hermes desktop clients:
- [`fathah/hermes-desktop`](https://github.com/fathah/hermes-desktop) (Electron + React) — slash-command system, screen layouts, providers list
- [`dodo-reach/hermes-desktop`](https://github.com/dodo-reach/hermes-desktop) (SwiftUI macOS) — hash-based file-edit conflict detection, profile-as-context philosophy, cron-builder design

Both are great projects. We aimed to take their best ideas and ship a single Electron client with the union of their feature sets plus things neither has.

## License

[MIT](LICENSE)
