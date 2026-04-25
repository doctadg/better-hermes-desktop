/**
 * MCP server config persistence.
 *
 * Wraps `window.hermesAPI.storeGet/storeSet` (generic KV, see
 * electron/preload.ts). Validates the shape on read so a malformed entry
 * cannot crash the renderer — bad rows are filtered out silently.
 *
 * The legacy `HermesAPI` interface in `src/api/types.ts` predates the
 * Phase 0 storage bridge and does not declare `storeGet/storeSet`. We cast
 * through `unknown` to a narrow shape that mirrors only what this module
 * needs, without touching the global ambient declaration.
 */

import type { McpServerConfig } from './types';

const STORAGE_KEY = 'mcp_servers';

interface StoreBridge {
  storeGet: <T = unknown>(key: string) => Promise<T | undefined>;
  storeSet: (key: string, value: unknown) => Promise<void>;
}

interface PreloadShape {
  storeGet?: StoreBridge['storeGet'];
  storeSet?: StoreBridge['storeSet'];
}

function getBridge(): StoreBridge | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { hermesAPI?: PreloadShape }).hermesAPI;
  if (!api?.storeGet || !api?.storeSet) return null;
  return { storeGet: api.storeGet, storeSet: api.storeSet };
}

/** Type guard — returns true only if `v` looks like a McpServerConfig. */
function isMcpServerConfig(v: unknown): v is McpServerConfig {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return false;
  if (typeof o.name !== 'string') return false;
  if (typeof o.command !== 'string') return false;
  if (!Array.isArray(o.args)) return false;
  if (!o.args.every((a) => typeof a === 'string')) return false;
  if (!o.env || typeof o.env !== 'object' || Array.isArray(o.env)) return false;
  for (const val of Object.values(o.env as Record<string, unknown>)) {
    if (typeof val !== 'string') return false;
  }
  if (typeof o.autostart !== 'boolean') return false;
  if (typeof o.enabled !== 'boolean') return false;
  return true;
}

/**
 * Load the persisted MCP server list, filtering out malformed entries.
 * Returns `[]` when the bridge is unavailable or the key is unset.
 */
export async function loadMcpServers(): Promise<McpServerConfig[]> {
  const bridge = getBridge();
  if (!bridge) return [];
  try {
    const raw = await bridge.storeGet<unknown>(STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(isMcpServerConfig);
  } catch {
    return [];
  }
}

/**
 * Persist the full MCP server list (overwrites the stored value). Caller
 * is responsible for shape — types prevent obvious mistakes but the value
 * is round-tripped through JSON in the IPC channel.
 */
export async function saveMcpServers(list: McpServerConfig[]): Promise<void> {
  const bridge = getBridge();
  if (!bridge) {
    throw new Error('MCP storage unavailable: window.hermesAPI.storeSet missing.');
  }
  await bridge.storeSet(STORAGE_KEY, list);
}

/** Generate a short, sortable id without pulling in a uuid dep. */
export function newMcpServerId(): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `mcp_${Date.now().toString(36)}_${r}`;
}
