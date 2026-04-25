/**
 * Toolsets tab — lists built-in toolsets exposed by the Hermes server,
 * grouped by category, each with an enable/disable toggle.
 *
 * Backend caveat: `client.getToolsets()` exists in the typed client, but
 * `setToolsetEnabled` is NOT in `src/api/client.ts`. We use the generic
 * `client.invoke` style by calling through the underlying fetch via the
 * approach described in INTEGRATION.md. For now this tab uses
 * `window.hermesAPI.invoke('toolsets:set-enabled', ...)` as a dispatch
 * escape hatch — the main process can either proxy to the server or no-op
 * (the UI disables toggles when the bridge call rejects).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Power } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection';
import type { ToolsetInfo } from '@/api/types';

interface InvokeBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

function getInvoke(): InvokeBridge['invoke'] | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { hermesAPI?: Partial<InvokeBridge> }).hermesAPI;
  return api?.invoke ?? null;
}

/**
 * Try to flip the enabled flag on the server. Returns true on success.
 * Currently routes through `window.hermesAPI.invoke('toolsets:set-enabled')`
 * because the typed `HermesClient` does not expose a setter — see the
 * INTEGRATION.md "client.ts gaps" section.
 */
async function setToolsetEnabledViaBridge(name: string, enabled: boolean): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) return false;
  try {
    await invoke('toolsets:set-enabled', { name, enabled });
    return true;
  } catch {
    return false;
  }
}

interface ToolsetGroup {
  category: string;
  items: ToolsetInfo[];
}

/** Pure helper: bucket toolsets by their `label`-prefix or fall back to a
 *  single "General" group. The server response doesn't carry an explicit
 *  category field, so we synthesize one from the name's first segment
 *  (e.g. `web_search` → `web`, `fs_read` → `fs`). */
function groupByCategory(list: ToolsetInfo[]): ToolsetGroup[] {
  const buckets = new Map<string, ToolsetInfo[]>();
  for (const ts of list) {
    const seg = ts.name.split(/[._-]/, 1)[0] ?? 'general';
    const cat = seg.length > 0 ? seg : 'general';
    const arr = buckets.get(cat) ?? [];
    arr.push(ts);
    buckets.set(cat, arr);
  }
  return Array.from(buckets.entries())
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function ToolsetsTab(): React.JSX.Element {
  const getClient = useConnectionStore((s) => s.getClient);
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [bridgeWarning, setBridgeWarning] = useState<string | null>(null);

  const fetchToolsets = useCallback(async () => {
    const client = getClient();
    if (!client) {
      setLoading(false);
      setToolsets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await client.getToolsets();
      setToolsets(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load toolsets');
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    void fetchToolsets();
  }, [fetchToolsets]);

  const handleToggle = useCallback(
    async (ts: ToolsetInfo) => {
      setToggling(ts.name);
      const next = !ts.enabled;
      // Optimistic UI flip.
      setToolsets((prev) =>
        prev.map((t) => (t.name === ts.name ? { ...t, enabled: next } : t)),
      );
      const ok = await setToolsetEnabledViaBridge(ts.name, next);
      if (!ok) {
        // Roll back and surface the limitation.
        setToolsets((prev) =>
          prev.map((t) => (t.name === ts.name ? { ...t, enabled: ts.enabled } : t)),
        );
        setBridgeWarning(
          'Toolset toggling is not yet wired up — the server endpoint is read-only. ' +
          'See INTEGRATION.md for the v0.3 plan.',
        );
      }
      setToggling(null);
    },
    [],
  );

  const groups = useMemo(() => groupByCategory(toolsets), [toolsets]);
  const client = getClient();

  if (!client) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-600 text-sm px-6 text-center">
        Connect to a Hermes server to see available toolsets.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse"
            >
              <div className="h-4 bg-zinc-800 rounded w-2/3 mb-2" />
              <div className="h-3 bg-zinc-800 rounded w-full mb-1" />
              <div className="h-3 bg-zinc-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {toolsets.length} toolset{toolsets.length === 1 ? '' : 's'} ·{' '}
          {toolsets.filter((t) => t.enabled).length} enabled
        </span>
        <button
          onClick={fetchToolsets}
          className="px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 rounded transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 mb-3">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-300"
            >
              x
            </button>
          </div>
        )}

        {bridgeWarning && (
          <div className="text-xs text-amber-300 bg-amber-900/20 border border-amber-800 rounded-lg px-3 py-2 mb-3">
            {bridgeWarning}
            <button
              onClick={() => setBridgeWarning(null)}
              className="ml-2 text-amber-500 hover:text-amber-300"
            >
              x
            </button>
          </div>
        )}

        {toolsets.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-zinc-600 text-sm">
            No toolsets available on this server.
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.category}>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
                  {group.category}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.items.map((ts) => (
                    <div
                      key={ts.name}
                      className={`p-3 bg-zinc-900 border rounded-xl transition-colors duration-150 ${
                        ts.enabled
                          ? 'border-emerald-500/30'
                          : 'border-zinc-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-zinc-200 truncate">
                            {ts.label || ts.name}
                          </h3>
                          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                            {ts.description}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] shrink-0 mt-0.5 ${
                            ts.enabled
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {ts.enabled ? 'Active' : 'Off'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-zinc-600">
                          {ts.tools.length}{' '}
                          {ts.tools.length === 1 ? 'tool' : 'tools'}
                          {!ts.configured && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-500">
                              not configured
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => handleToggle(ts)}
                          disabled={toggling !== null}
                          className={`p-1.5 rounded transition-colors duration-150 disabled:opacity-40 ${
                            ts.enabled
                              ? 'text-emerald-400 hover:bg-emerald-500/10'
                              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                          }`}
                          title={ts.enabled ? 'Disable toolset' : 'Enable toolset'}
                        >
                          <Power size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
