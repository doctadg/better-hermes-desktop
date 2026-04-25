/**
 * ProfileTab — single-textarea editor for USER.md with debounced auto-save
 * plus an explicit hash-checked Save button.
 *
 * Two write paths, by design:
 *
 *   - Auto-save (800ms debounce): fires while the user is typing. Skips the
 *     conflict pre-check — blocking the user mid-keystroke on a hash compare
 *     would be miserable, and the typical USER.md edit is the user's own
 *     buffer; cross-device drift is the rare case. After a successful patch
 *     we adopt the just-written content as the new baseline so the explicit
 *     Save button (which *does* compare hashes) stays accurate.
 *
 *   - Explicit Save: does the full re-fetch + hash compare. If MEMORY.md
 *     drifted on the server since we loaded it, throws `ConflictError` and we
 *     render the `ConflictModal` so the user can reload or force overwrite.
 *
 * Capacity bar still tracks chars vs the server-reported `charLimit` (or 1375).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection';
import type { MemoryResponse } from '@/api/types';
import { CapacityBar } from './CapacityBar';
import { ConflictError, useMemoryConflict } from './useMemoryConflict';
import { ConflictModal } from './ConflictModal';

const DEBOUNCE_MS = 800;
const DEFAULT_CHAR_LIMIT = 1375;

interface MemoryResponseExt extends MemoryResponse {
  charLimit?: number;
  charCount?: number;
}

export function ProfileTab() {
  const client = useConnectionStore((s) => s.client);

  const [charLimit, setCharLimit] = useState<number>(DEFAULT_CHAR_LIMIT);
  const [autoSaving, setAutoSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<ConflictError | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conflict = useMemoryConflict(
    useMemo(
      () => ({
        load: async () => {
          if (!client) return { content: '' };
          const res = (await client.getUserProfile()) as MemoryResponseExt;
          const limit = res.charLimit ?? DEFAULT_CHAR_LIMIT;
          setCharLimit(limit > 0 ? limit : DEFAULT_CHAR_LIMIT);
          return { content: res.content || '' };
        },
        save: async (content: string) => {
          if (!client) return;
          const res = (await client.patchUserProfile({ content })) as MemoryResponseExt;
          const limit = res.charLimit ?? DEFAULT_CHAR_LIMIT;
          setCharLimit(limit > 0 ? limit : DEFAULT_CHAR_LIMIT);
        },
      }),
      [client],
    ),
  );

  const { content, setContent, isDirty, loading, saving } = conflict;

  // Cancel any pending debounced save on unmount.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  /**
   * Debounced auto-save. Bypasses the conflict hook's hash compare entirely
   * — we call the patch endpoint directly via the same client the hook uses,
   * then re-snapshot the hook's baseline to the just-written content so the
   * next explicit Save sees the right "expected" hash.
   */
  const scheduleAutoSave = useCallback(
    (value: string) => {
      setContent(value);
      if (!client) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setAutoSaving(true);
        setAutoSaveError(null);
        try {
          const res = (await client.patchUserProfile({ content: value })) as MemoryResponseExt;
          const limit = res.charLimit ?? DEFAULT_CHAR_LIMIT;
          setCharLimit(limit > 0 ? limit : DEFAULT_CHAR_LIMIT);
          setSavedAt(Date.now());
          // Re-fetch through the hook so its hash baseline catches up to the
          // server's canonical content (handles whitespace normalisation and
          // also resyncs `originalContent` for `isDirty`).
          await conflict.load();
        } catch (err) {
          setAutoSaveError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
          setAutoSaving(false);
        }
      }, DEBOUNCE_MS);
    },
    [client, setContent, conflict],
  );

  const handleManualSave = useCallback(async () => {
    // Cancel any pending auto-save so we don't race.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setAutoSaveError(null);
    try {
      await conflict.save();
      setSavedAt(Date.now());
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflictError(err);
      }
      // Other errors land on `conflict.error`.
    }
  }, [conflict]);

  const handleReload = useCallback(async () => {
    setConflictError(null);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await conflict.load();
  }, [conflict]);

  const handleForceOverwrite = useCallback(async () => {
    setConflictError(null);
    try {
      await conflict.forceSave();
      setSavedAt(Date.now());
    } catch {
      // surfaced via conflict.error
    }
  }, [conflict]);

  const handleCancelConflict = useCallback(() => {
    setConflictError(null);
  }, []);

  if (!client) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        No connection. Connect to a Hermes server to edit your profile.
      </div>
    );
  }

  const showSaving = autoSaving || saving;
  const displayedError = conflict.error || autoSaveError;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <CapacityBar used={content.length} limit={charLimit} label="USER.md" />
        <div className="flex items-center justify-end mt-2 text-[11px] gap-3">
          {isDirty && !showSaving && (
            <span className="text-amber-400">unsaved · auto-saving</span>
          )}
          {showSaving && <span className="text-amber-400">saving...</span>}
          {savedAt && !showSaving && !isDirty && (
            <span className="text-emerald-400">saved</span>
          )}
          <button
            type="button"
            onClick={() => void conflict.load()}
            disabled={loading || showSaving}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 disabled:opacity-40"
            title="Reload from server"
          >
            <RefreshCw
              size={11}
              className={loading ? 'animate-spin' : undefined}
            />
            Reload
          </button>
          <button
            type="button"
            onClick={() => void handleManualSave()}
            disabled={showSaving || loading || !isDirty}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-zinc-300 hover:text-amber-400 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:text-zinc-300 disabled:hover:bg-transparent"
            title="Save now (checks for conflicts)"
          >
            <Save size={11} />
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {displayedError && (
          <div className="text-xs text-rose-400 bg-rose-900/20 border border-rose-800 rounded-lg px-3 py-2 mb-3">
            {displayedError}
            <button
              onClick={() => setAutoSaveError(null)}
              className="ml-2 text-rose-500 hover:text-rose-300"
            >
              dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
            <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
            Loading USER.md...
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => scheduleAutoSave(e.target.value)}
            spellCheck={false}
            placeholder="Tell Hermes about yourself — name, role, preferences, communication style..."
            className="w-full h-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 resize-none focus:border-amber-500 outline-none font-mono leading-relaxed selectable"
          />
        )}
      </div>

      {conflictError && (
        <ConflictModal
          error={conflictError}
          fileLabel="USER.md"
          onReload={() => void handleReload()}
          onForceOverwrite={() => void handleForceOverwrite()}
          onCancel={handleCancelConflict}
        />
      )}
    </div>
  );
}
