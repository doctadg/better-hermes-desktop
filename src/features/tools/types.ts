/**
 * Tools feature — shared types.
 *
 * `McpServerConfig` is the locally-stored shape for an MCP (Model Context
 * Protocol) server entry. Persisted in the generic KV store under
 * `mcp_servers` via `window.hermesAPI.storeGet/storeSet`.
 *
 * NOTE: this only stores configurations. Actually spawning MCP servers
 * (stdio child process, env injection, etc.) requires a future main-process
 * IPC handler — see INTEGRATION.md for the v0.3 plan.
 */

export interface McpServerConfig {
  /** Stable id (uuid-ish) — used as React key and selection target. */
  id: string;
  /** Display name shown in the list and detail header. */
  name: string;
  /** Executable command, e.g. "npx" or "/usr/local/bin/mcp-server-foo". */
  command: string;
  /** Positional argv passed to the command. */
  args: string[];
  /** Environment variables injected into the spawned process. */
  env: Record<string, string>;
  /** If true, future main-process supervisor should launch on app start. */
  autostart: boolean;
  /** If false, the entry is skipped entirely (kept for editing). */
  enabled: boolean;
}

/** Form-time draft used by the editor pane. Same shape as McpServerConfig. */
export type McpServerDraft = McpServerConfig;
