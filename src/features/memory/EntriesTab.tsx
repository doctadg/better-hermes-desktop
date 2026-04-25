/**
 * EntriesTab — MEMORY.md viewer/editor split into individual entries.
 *
 * Entries in MEMORY.md are separated by a literal `\n§\n` line. Each entry
 * is shown as a textarea with Save / Delete / Duplicate buttons. The whole
 * file is serialized back together on save.
 *
 * The capacity bar at the top tracks total chars vs `charLimit` (falling
 * back to 2200 when the server doesn't report one).
 *
 * Concurrency: writes go through `useMemoryConflict`, which hashes the file
 * at load-time and re-checks on save. If MEMORY.md drifted on the server
 * since we loaded it, `save()` throws `ConflictError` and we render the
 * `ConflictModal` so the user can reload or force overwrite.
 *
 * The file-level hash is the unit of concurrency: per-entry Save / Delete /
 * Duplicate buttons all serialize the full entry list back to one blob and
 * write that. Splitting into per-entry hashes would require a server-side
 * entry id, which doesn't exist.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, Trash2, Copy, RefreshCw } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection';
import type { MemoryResponse } from '@/api/types';
import { CapacityBar } from './CapacityBar';
import { ConflictError, useMemoryConflict } from './useMemoryConflict';
import { ConflictModal } from './ConflictModal';

const ENTRY_DELIMITER = '\n§\n';
const DEFAULT_CHAR_LIMIT = 2200;

interface MemoryResponseExt extends MemoryResponse {
  // Some server builds expose extra fields the typed contract doesn't model.
  exists?: boolean;
  lastModified?: number | null;
  charCount?: number;
  charLimit?: number;
}

interface EntryDraft {
  /** Stable client-side id used as React key. */
  key: string;
  /** Current textarea value (may differ from `saved`). */
  value: string;
  /** Last server-confirmed value. */
  saved: string;
}

let nextKey = 1;
function makeKey(): string {
  nextKey += 1;
  return `entry-${nextKey}-${Math.random().toString(36).slice(2, 8)}`;
}

function splitEntries(content: string): string[] {
  if (!content || !content.trim()) return [];
  return content.split(ENTRY_DELIMITER);
}

function joinEntries(entries: string[]): string {
  return entries.filter((e) => e.length > 0).join(ENTRY_DELIMITER);
}

export function EntriesTab() {
  const client = useConnectionStore((s) => s.client);

  // The conflict hook owns the *file-level* buffer. We keep a separate
  // `drafts` state for the per-entry UI and sync them on load / save.
  const conflict = useMemoryConflict(
    useMemo(
      () => ({
        load: async () => {
          if (!client) return { content: '' };
          const res = (await client.getMemory()) as MemoryResponseExt;
          // Side-channel: stash the server's reported limit so the capacity
          // bar updates without piping through the conflict hook.
          const limit = res.charLimit ?? DEFAULT_CHAR_LIMIT;
          setCharLimit(limit > 0 ? limit : DEFAULT_CHAR_LIMIT);
          return { content: res.content || '' };
        },
        save: async (content: string) => {
          if (!client) return;
          const res = (await client.patchMemory({ content })) as MemoryResponseExt;
          const limit = res.charLimit ?? DEFAULT_CHAR_LIMIT;
          setCharLimit(limit > 0 ? limit : DEFAULT_CHAR_LIMIT);
        },
      }),
      [client],
    ),
  );

  const [drafts, setDrafts] = useState<EntryDraft[]>([]);
  const [charLimit, setCharLimit] = useState<number>(DEFAULT_CHAR_LIMIT);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<ConflictError | null>(null);
  // Action that triggered a conflict — replayed after the user picks Force
  // overwrite, so a Delete-that-conflicted resolves with the same delete.
  const pendingActionRef = useRef<{
    next: EntryDraft[];
    action: 'save' | 'delete' | 'duplicate';
    actionKey: string;
  } | null>(null);
  const savedClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the server's content snapshot changes (initial load or after a
  // successful save), re-derive the per-entry drafts. We compare against the
  // current saved string to avoid clobbering in-flight edits the user just
  // typed but hasn't dispatched yet.
  const lastSyncedOriginalRef = useRef<string | null>(null);
  useEffect(() => {
    if (conflict.loading) return;
    if (lastSyncedOriginalRef.current === conflict.originalContent) return;
    lastSyncedOriginalRef.current = conflict.originalContent;
    const pieces = splitEntries(conflict.originalContent);
    setDrafts(pieces.map((p) => ({ key: makeKey(), value: p, saved: p })));
  }, [conflict.loading, conflict.originalContent]);

  useEffect(
    () => () => {
      if (savedClearTimer.current) clearTimeout(savedClearTimer.current);
    },
    [],
  );

  const totalChars = useMemo(
    () => drafts.reduce((sum, d) => sum + d.value.length, 0),
    [drafts],
  );

  const flashSaved = useCallback((key: string) => {
    setSavedKey(key);
    if (savedClearTimer.current) clearTimeout(savedClearTimer.current);
    savedClearTimer.current = setTimeout(() => setSavedKey(null), 1500);
  }, []);

  // Persist a synthesized entries array to the server through the conflict
  // hook, then refresh the local drafts to reflect the server snapshot.
  const persist = useCallback(
    async (
      next: EntryDraft[],
      action: 'save' | 'delete' | 'duplicate',
      actionKey: string,
      opts: { force?: boolean } = {},
    ) => {
      if (!client) return;
      setBusyKey(actionKey);
      try {
        const content = joinEntries(next.map((d) => d.value));
        // Push the serialized file into the conflict hook's buffer so
        // `save()` writes the right thing.
        conflict.setContent(content);
        if (opts.force) {
          await conflict.forceSave();
        } else {
          await conflict.save();
        }
        // Adopt the just-written drafts as the server-confirmed snapshot.
        // We deliberately don't wait for the next loaded-snapshot sync
        // because the user may have already started typing in another entry.
        setDrafts(next.map((d) => ({ ...d, saved: d.value })));
        lastSyncedOriginalRef.current = content;
        if (action === 'save') flashSaved(actionKey);
        pendingActionRef.current = null;
      } catch (err) {
        if (err instanceof ConflictError) {
          // Stash the action so Force overwrite can replay it.
          pendingActionRef.current = { next, action, actionKey };
          setConflictError(err);
        }
        // All other errors land in `conflict.error` via the hook.
      } finally {
        setBusyKey(null);
      }
    },
    [client, conflict, flashSaved],
  );

  const handleChange = useCallback((key: string, value: string) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, value } : d)));
  }, []);

  const handleSave = useCallback(
    (key: string) => {
      const snapshot = drafts;
      void persist(snapshot, 'save', key);
    },
    [drafts, persist],
  );

  const handleDelete = useCallback(
    (key: string) => {
      const next = drafts.filter((d) => d.key !== key);
      void persist(next, 'delete', key);
    },
    [drafts, persist],
  );

  const handleDuplicate = useCallback(
    (key: string) => {
      const idx = drafts.findIndex((d) => d.key === key);
      if (idx === -1) return;
      const dup: EntryDraft = {
        key: makeKey(),
        value: drafts[idx].value,
        saved: drafts[idx].value,
      };
      const next = [...drafts.slice(0, idx + 1), dup, ...drafts.slice(idx + 1)];
      void persist(next, 'duplicate', key);
    },
    [drafts, persist],
  );

  const handleAdd = useCallback(() => {
    const fresh: EntryDraft = { key: makeKey(), value: '', saved: '' };
    setDrafts((prev) => [...prev, fresh]);
  }, []);

  const handleReload = useCallback(async () => {
    setConflictError(null);
    pendingActionRef.current = null;
    await conflict.load();
  }, [conflict]);

  const handleForceOverwrite = useCallback(async () => {
    const pending = pendingActionRef.current;
    setConflictError(null);
    if (!pending) {
      // No replayable action — just overwrite with whatever's in the buffer.
      try {
        await conflict.forceSave();
      } catch {
        // surfaced via conflict.error
      }
      return;
    }
    await persist(pending.next, pending.action, pending.actionKey, { force: true });
  }, [conflict, persist]);

  const handleCancelConflict = useCallback(() => {
    setConflictError(null);
    pendingActionRef.current = null;
  }, []);

  if (!client) {
    return <NoConnection />;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <CapacityBar
              used={totalChars}
              limit={charLimit}
              label={`MEMORY.md · ${drafts.length} ${drafts.length === 1 ? 'entry' : 'entries'}`}
            />
          </div>
          <button
            type="button"
            onClick={() => void conflict.load()}
            disabled={conflict.loading || conflict.saving}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 disabled:opacity-40"
            title="Reload from server"
          >
            <RefreshCw
              size={12}
              className={conflict.loading ? 'animate-spin' : undefined}
            />
            Reload
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {conflict.error && (
          <div className="text-xs text-rose-400 bg-rose-900/20 border border-rose-800 rounded-lg px-3 py-2">
            {conflict.error}
          </div>
        )}

        {conflict.loading ? (
          <div className="flex items-center justify-center text-zinc-500 text-sm py-12">
            <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
            Loading MEMORY.md...
          </div>
        ) : drafts.length === 0 ? (
          <div className="text-zinc-500 text-sm text-center py-12">
            <p>No memory entries yet.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Use &quot;Add entry&quot; below to create your first one.
            </p>
          </div>
        ) : (
          drafts.map((d) => {
            const dirty = d.value !== d.saved;
            const busy = busyKey === d.key;
            const justSaved = savedKey === d.key;
            return (
              <div
                key={d.key}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <textarea
                  value={d.value}
                  onChange={(e) => handleChange(d.key, e.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder="Memory entry content..."
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 resize-y focus:border-amber-500 outline-none font-mono leading-relaxed"
                />
                <div className="flex items-center justify-between mt-2 text-[11px]">
                  <span className="text-zinc-500 tabular-nums">
                    {d.value.length} chars
                    {dirty && (
                      <span className="ml-2 text-amber-400">unsaved</span>
                    )}
                    {justSaved && (
                      <span className="ml-2 text-emerald-400">saved</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSave(d.key)}
                      disabled={busy || !dirty}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-300 hover:text-amber-400 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:text-zinc-300 disabled:hover:bg-transparent"
                      title="Save entry"
                    >
                      <Save size={12} /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(d.key)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
                      title="Duplicate entry"
                    >
                      <Copy size={12} /> Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(d.key)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 disabled:opacity-40"
                      title="Delete entry"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {!conflict.loading && (
          <div className="pt-2">
            <button
              type="button"
              onClick={handleAdd}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-amber-500 text-sm transition-colors"
            >
              <Plus size={14} /> Add entry
            </button>
          </div>
        )}
      </div>

      {conflictError && (
        <ConflictModal
          error={conflictError}
          fileLabel="MEMORY.md"
          onReload={() => void handleReload()}
          onForceOverwrite={() => void handleForceOverwrite()}
          onCancel={handleCancelConflict}
        />
      )}
    </div>
  );
}

function NoConnection() {
  return (
    <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
      No connection. Connect to a Hermes server to edit memory.
    </div>
  );
}
