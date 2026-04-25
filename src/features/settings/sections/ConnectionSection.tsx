/**
 * Connection — saved server list with add / edit / test / remove flow.
 *
 * Reads from `useConnectionStore` and uses its CRUD actions. Health checks
 * run on demand against a freshly-built `HermesClient` so we don't disturb
 * the active client. The currently active connection is highlighted and
 * pinned to the top via the store's `activeConnectionId`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plug, Plus, Check, Trash2, RefreshCw } from 'lucide-react';

import { useConnectionStore } from '@/stores/connection';
import { HermesClient } from '@/api/client';
import type { ServerConnection } from '@/api/types';

type StatusKind = 'idle' | 'testing' | 'ok' | 'error';

interface DraftState {
  id: string | null;
  label: string;
  url: string;
  token: string;
}

const EMPTY_DRAFT: DraftState = { id: null, label: '', url: 'https://', token: '' };

function StatusPill({ kind, message }: { kind: StatusKind; message?: string }): React.JSX.Element {
  if (kind === 'idle') return <></>;
  const styles: Record<Exclude<StatusKind, 'idle'>, string> = {
    testing: 'bg-zinc-800 text-zinc-300',
    ok: 'bg-emerald-900/30 text-emerald-300 border border-emerald-800',
    error: 'bg-red-900/30 text-red-300 border border-red-800',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full ${styles[kind]}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          kind === 'ok' ? 'bg-emerald-400' : kind === 'error' ? 'bg-red-400' : 'bg-zinc-500 animate-pulse'
        }`}
      />
      {message ?? kind}
    </span>
  );
}

export function ConnectionSection(): React.JSX.Element {
  const connections = useConnectionStore((s) => s.connections);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const addConnection = useConnectionStore((s) => s.addConnection);
  const updateConnection = useConnectionStore((s) => s.updateConnection);
  const removeConnection = useConnectionStore((s) => s.removeConnection);
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection);
  const healthStatus = useConnectionStore((s) => s.healthStatus);

  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [isEditing, setIsEditing] = useState(false);
  const [testStatus, setTestStatus] = useState<{ kind: StatusKind; message?: string }>({ kind: 'idle' });
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Reset confirm-delete after a short window so it doesn't linger.
  useEffect(() => {
    if (!confirmRemoveId) return;
    const t = setTimeout(() => setConfirmRemoveId(null), 4000);
    return (): void => clearTimeout(t);
  }, [confirmRemoveId]);

  const sorted = useMemo(() => {
    return [...connections].sort((a, b) => {
      if (a.id === activeConnectionId) return -1;
      if (b.id === activeConnectionId) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [connections, activeConnectionId]);

  const startNew = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setTestStatus({ kind: 'idle' });
    setIsEditing(true);
  }, []);

  const startEdit = useCallback((conn: ServerConnection) => {
    setDraft({ id: conn.id, label: conn.label, url: conn.url, token: conn.token });
    setTestStatus({ kind: 'idle' });
    setIsEditing(true);
  }, []);

  const cancel = useCallback(() => {
    setIsEditing(false);
    setDraft(EMPTY_DRAFT);
    setTestStatus({ kind: 'idle' });
  }, []);

  const handleTest = useCallback(async () => {
    const url = draft.url.trim();
    if (!url) {
      setTestStatus({ kind: 'error', message: 'Enter a URL first' });
      return;
    }
    setTestStatus({ kind: 'testing', message: 'Testing…' });
    try {
      const client = new HermesClient(url, draft.token.trim());
      const health = await client.healthCheck();
      const label = health.status === 'ok' || health.status === 'healthy' ? 'Healthy' : (health.status as string);
      setTestStatus({ kind: 'ok', message: label });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setTestStatus({ kind: 'error', message });
    }
  }, [draft.url, draft.token]);

  const handleSave = useCallback(() => {
    const label = draft.label.trim();
    const url = draft.url.trim();
    if (!label || !url) return;
    if (draft.id) {
      updateConnection(draft.id, { label, url, token: draft.token });
    } else {
      addConnection({ label, url, token: draft.token });
    }
    cancel();
  }, [draft, addConnection, updateConnection, cancel]);

  const handleSetActive = useCallback(
    async (id: string) => {
      await setActiveConnection(id);
    },
    [setActiveConnection]
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (confirmRemoveId !== id) {
        setConfirmRemoveId(id);
        return;
      }
      removeConnection(id);
      setConfirmRemoveId(null);
    },
    [confirmRemoveId, removeConnection]
  );

  const isValid = draft.label.trim().length > 0 && draft.url.trim().length > 3;

  return (
    <div className="space-y-4">
      {/* List */}
      <section className="space-y-2">
        {sorted.length === 0 && !isEditing && (
          <div className="p-6 bg-zinc-900 border border-dashed border-zinc-800 rounded-xl text-center">
            <Plug size={20} className="mx-auto text-zinc-600 mb-2" />
            <div className="text-sm text-zinc-400">No saved connections.</div>
            <div className="text-xs text-zinc-500 mt-1">Add a Hermes server to get started.</div>
          </div>
        )}
        {sorted.map((conn) => {
          const health = healthStatus[conn.id];
          const isActive = conn.id === activeConnectionId;
          const healthKind: StatusKind = health
            ? health.status === 'ok' || health.status === 'healthy'
              ? 'ok'
              : 'error'
            : 'idle';
          return (
            <div
              key={conn.id}
              className={`p-3 rounded-xl border ${
                isActive ? 'bg-zinc-900 border-amber-700/50' : 'bg-zinc-900 border-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100 truncate">{conn.label}</span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-amber-500/20 text-amber-300">
                        <Check size={10} />
                        Active
                      </span>
                    )}
                    <StatusPill kind={healthKind} message={healthKind === 'ok' ? 'Healthy' : healthKind === 'error' ? 'Down' : undefined} />
                  </div>
                  <div className="text-xs text-zinc-500 font-mono truncate mt-0.5">{conn.url}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => handleSetActive(conn.id)}
                      className="px-2 py-1 text-xs rounded-md text-zinc-300 hover:bg-zinc-800"
                      title="Connect"
                    >
                      Connect
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(conn)}
                    className="px-2 py-1 text-xs rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(conn.id)}
                    className={`p-1 rounded-md transition-colors ${
                      confirmRemoveId === conn.id
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'text-red-400 hover:bg-red-900/20 hover:text-red-300'
                    }`}
                    title={confirmRemoveId === conn.id ? 'Click again to confirm' : 'Remove'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Editor / new */}
      {isEditing ? (
        <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">{draft.id ? 'Edit connection' : 'New connection'}</h3>
            <StatusPill kind={testStatus.kind} message={testStatus.message} />
          </div>
          <div className="space-y-2">
            <label className="block">
              <span className="block text-xs text-zinc-400 mb-1">Label</span>
              <input
                type="text"
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="My Hermes Server"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 outline-none focus:border-amber-500"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-zinc-400 mb-1">Server URL</span>
              <input
                type="url"
                value={draft.url}
                onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                placeholder="https://localhost:8080"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-mono text-zinc-100 outline-none focus:border-amber-500"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-zinc-400 mb-1">API Token</span>
              <input
                type="password"
                value={draft.token}
                onChange={(e) => setDraft((d) => ({ ...d, token: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-mono text-zinc-100 outline-none focus:border-amber-500"
              />
            </label>
          </div>
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!isValid || testStatus.kind === 'testing'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
            >
              <RefreshCw size={12} />
              Test
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancel}
                className="px-3 py-1.5 text-xs rounded-lg text-zinc-400 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isValid}
                className="px-4 py-1.5 text-xs rounded-lg bg-amber-500 text-zinc-950 font-medium hover:bg-amber-400 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={startNew}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-dashed border-zinc-700 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
        >
          <Plus size={14} />
          Add connection
        </button>
      )}
    </div>
  );
}

export default ConnectionSection;
