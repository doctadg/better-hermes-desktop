/**
 * MCP server registry tab — local CRUD over `window.hermesAPI.storeGet/Set`.
 *
 * Layout: list on the left (name + status pill), detail/editor on the right.
 * "+ Add" creates a blank entry and opens it for editing. Save persists the
 * full array via `saveMcpServers`. Delete removes the selected entry.
 *
 * Note: this only manages configurations. A future main-process IPC will
 * spawn the configured MCP servers and stream their tools into the
 * Hermes session — see INTEGRATION.md for the v0.3 plan.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Server, Settings, Trash2 } from 'lucide-react';
import {
  loadMcpServers,
  newMcpServerId,
  saveMcpServers,
} from './mcpStorage';
import type { McpServerConfig, McpServerDraft } from './types';

/** Parse a textarea string of args into a string[]. Splits on newlines and
 *  commas, trims whitespace, drops empties. */
export function parseArgs(raw: string): string[] {
  return raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function emptyDraft(): McpServerDraft {
  return {
    id: newMcpServerId(),
    name: '',
    command: '',
    args: [],
    env: {},
    autostart: false,
    enabled: true,
  };
}

function statusLabel(s: McpServerConfig): { text: string; tone: 'on' | 'off' } {
  if (!s.enabled) return { text: 'Disabled', tone: 'off' };
  if (s.autostart) return { text: 'Autostart', tone: 'on' };
  return { text: 'Configured', tone: 'on' };
}

interface EnvRow {
  key: string;
  value: string;
}

function envToRows(env: Record<string, string>): EnvRow[] {
  return Object.entries(env).map(([key, value]) => ({ key, value }));
}

function rowsToEnv(rows: EnvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    out[k] = r.value;
  }
  return out;
}

export function McpServersTab(): React.JSX.Element {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Editor draft state — kept separate from `servers` so unsaved edits don't
  // leak into the list view.
  const [draft, setDraft] = useState<McpServerDraft | null>(null);
  const [argsText, setArgsText] = useState('');
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadMcpServers();
      setServers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // When `selectedId` changes, hydrate the draft from the matching server.
  useEffect(() => {
    if (selectedId === null) {
      setDraft(null);
      setArgsText('');
      setEnvRows([]);
      return;
    }
    const found = servers.find((s) => s.id === selectedId);
    if (!found) {
      setDraft(null);
      setArgsText('');
      setEnvRows([]);
      return;
    }
    setDraft({ ...found, args: [...found.args], env: { ...found.env } });
    setArgsText(found.args.join('\n'));
    setEnvRows(envToRows(found.env));
  }, [selectedId, servers]);

  const handleAdd = useCallback(() => {
    const blank = emptyDraft();
    const next = [...servers, blank];
    setServers(next);
    setSelectedId(blank.id);
    // Note: not persisted yet — saved on first Save click.
  }, [servers]);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!draft.command.trim()) {
      setError('Command is required.');
      return;
    }
    setSaving(true);
    setError(null);
    const finalDraft: McpServerConfig = {
      ...draft,
      name: draft.name.trim(),
      command: draft.command.trim(),
      args: parseArgs(argsText),
      env: rowsToEnv(envRows),
    };
    const next = servers.some((s) => s.id === finalDraft.id)
      ? servers.map((s) => (s.id === finalDraft.id ? finalDraft : s))
      : [...servers, finalDraft];
    try {
      await saveMcpServers(next);
      setServers(next);
      // Reset draft snapshot to mirror the saved row.
      setDraft({ ...finalDraft, args: [...finalDraft.args], env: { ...finalDraft.env } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save MCP server');
    } finally {
      setSaving(false);
    }
  }, [draft, argsText, envRows, servers]);

  const handleDelete = useCallback(async () => {
    if (!draft) return;
    if (!confirm(`Delete MCP server "${draft.name || draft.id}"?`)) return;
    const next = servers.filter((s) => s.id !== draft.id);
    setSaving(true);
    setError(null);
    try {
      await saveMcpServers(next);
      setServers(next);
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete MCP server');
    } finally {
      setSaving(false);
    }
  }, [draft, servers]);

  const updateDraft = useCallback(<K extends keyof McpServerDraft>(key: K, value: McpServerDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const addEnvRow = useCallback(() => {
    setEnvRows((prev) => [...prev, { key: '', value: '' }]);
  }, []);

  const updateEnvRow = useCallback((idx: number, patch: Partial<EnvRow>) => {
    setEnvRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const removeEnvRow = useCallback((idx: number) => {
    setEnvRows((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const sortedServers = useMemo(
    () => [...servers].sort((a, b) => a.name.localeCompare(b.name)),
    [servers],
  );

  return (
    <div className="flex h-full">
      {/* List pane */}
      <div className="w-[280px] shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="shrink-0 px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {servers.length} server{servers.length === 1 ? '' : 's'}
          </span>
          <button
            onClick={handleAdd}
            className="px-2 py-1 text-[11px] text-amber-400 hover:bg-amber-500/10 rounded transition-colors flex items-center gap-1"
            title="Add MCP server"
          >
            <Plus size={12} />
            Add
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-xs text-zinc-600">Loading...</div>
          ) : sortedServers.length === 0 ? (
            <div className="p-4 text-xs text-zinc-600 text-center">
              No MCP servers configured.
              <br />
              Click "+ Add" to create one.
            </div>
          ) : (
            <ul>
              {sortedServers.map((s) => {
                const status = statusLabel(s);
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left px-3 py-2 border-b border-zinc-900 transition-colors duration-150 ${
                        selectedId === s.id
                          ? 'bg-zinc-900 border-l-2 border-l-amber-500'
                          : 'hover:bg-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Server
                            size={12}
                            className={
                              s.enabled ? 'text-emerald-400' : 'text-zinc-600'
                            }
                          />
                          <span className="text-sm text-zinc-200 truncate">
                            {s.name || '(unnamed)'}
                          </span>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] shrink-0 ${
                            status.tone === 'on'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {status.text}
                        </span>
                      </div>
                      {s.command && (
                        <div className="text-[10px] text-zinc-600 truncate mt-0.5 font-mono">
                          {s.command}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Detail pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {error && (
          <div className="mx-4 mt-3 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-300"
            >
              x
            </button>
          </div>
        )}

        {!draft ? (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm px-6 text-center">
            <div className="space-y-2">
              <Settings className="mx-auto text-zinc-700" size={32} />
              <div>Select an MCP server, or click "+ Add" to create one.</div>
              <div className="text-[11px] text-zinc-700">
                Configurations are stored locally; spawning servers requires a
                future main-process IPC (see INTEGRATION.md).
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-1">
                Name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => updateDraft('name', e.target.value)}
                placeholder="my-mcp-server"
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-1">
                Command
              </label>
              <input
                type="text"
                value={draft.command}
                onChange={(e) => updateDraft('command', e.target.value)}
                placeholder="npx"
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-1">
                Arguments
                <span className="ml-2 text-zinc-600 normal-case tracking-normal">
                  (one per line, or comma-separated)
                </span>
              </label>
              <textarea
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                rows={4}
                placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir'}
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 outline-none font-mono resize-y"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider">
                  Environment
                </label>
                <button
                  onClick={addEnvRow}
                  className="px-2 py-0.5 text-[10px] text-amber-400 hover:bg-amber-500/10 rounded transition-colors flex items-center gap-1"
                >
                  <Plus size={10} />
                  Add var
                </button>
              </div>
              {envRows.length === 0 ? (
                <div className="text-[11px] text-zinc-600 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  No environment variables. Click "Add var" to define one.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {envRows.map((row, idx) => (
                    <div key={idx} className="flex gap-1.5">
                      <input
                        type="text"
                        value={row.key}
                        onChange={(e) => updateEnvRow(idx, { key: e.target.value })}
                        placeholder="KEY"
                        className="flex-1 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:border-amber-500 outline-none font-mono"
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => updateEnvRow(idx, { value: e.target.value })}
                        placeholder="value"
                        className="flex-1 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:border-amber-500 outline-none font-mono"
                      />
                      <button
                        onClick={() => removeEnvRow(idx)}
                        className="px-2 py-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Remove variable"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 pt-2">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => updateDraft('enabled', e.target.checked)}
                  className="accent-amber-500"
                />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.autostart}
                  onChange={(e) => updateDraft('autostart', e.target.checked)}
                  className="accent-amber-500"
                />
                Autostart on app launch
              </label>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors flex items-center gap-1.5 disabled:opacity-40"
              >
                <Trash2 size={12} />
                Delete
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded transition-colors disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
