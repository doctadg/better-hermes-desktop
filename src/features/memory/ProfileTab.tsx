/**
 * ProfileTab — single-textarea editor for USER.md with debounced auto-save.
 *
 * Auto-saves 800ms after the user stops typing via `client.patchUserProfile`.
 * The capacity bar tracks chars vs the server-reported `charLimit` (or 1375).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '@/stores/connection';
import type { MemoryResponse } from '@/api/types';
import { CapacityBar } from './CapacityBar';

const DEBOUNCE_MS = 800;
const DEFAULT_CHAR_LIMIT = 1375;

interface MemoryResponseExt extends MemoryResponse {
  charLimit?: number;
  charCount?: number;
}

export function ProfileTab() {
  const client = useConnectionStore((s) => s.client);

  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [charLimit, setCharLimit] = useState<number>(DEFAULT_CHAR_LIMIT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = (await client.getUserProfile()) as MemoryResponseExt;
      const limit = res.charLimit ?? DEFAULT_CHAR_LIMIT;
      setContent(res.content || '');
      setSavedContent(res.content || '');
      setCharLimit(limit > 0 ? limit : DEFAULT_CHAR_LIMIT);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load USER.md');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const scheduleSave = useCallback(
    (value: string) => {
      setContent(value);
      if (!client) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        setError(null);
        try {
          const res = (await client.patchUserProfile({ content: value })) as MemoryResponseExt;
          const limit = res.charLimit ?? DEFAULT_CHAR_LIMIT;
          setSavedContent(res.content || '');
          setCharLimit(limit > 0 ? limit : DEFAULT_CHAR_LIMIT);
          setSavedAt(Date.now());
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
          setSaving(false);
        }
      }, DEBOUNCE_MS);
    },
    [client],
  );

  if (!client) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        No connection. Connect to a Hermes server to edit your profile.
      </div>
    );
  }

  const dirty = content !== savedContent;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <CapacityBar used={content.length} limit={charLimit} label="USER.md" />
        <div className="flex items-center justify-end mt-2 text-[11px] gap-3">
          {dirty && !saving && (
            <span className="text-amber-400">unsaved · auto-saving</span>
          )}
          {saving && <span className="text-amber-400">saving...</span>}
          {savedAt && !saving && !dirty && (
            <span className="text-emerald-400">saved</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {error && (
          <div className="text-xs text-rose-400 bg-rose-900/20 border border-rose-800 rounded-lg px-3 py-2 mb-3">
            {error}
            <button
              onClick={() => setError(null)}
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
            onChange={(e) => scheduleSave(e.target.value)}
            spellCheck={false}
            placeholder="Tell Hermes about yourself — name, role, preferences, communication style..."
            className="w-full h-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 resize-none focus:border-amber-500 outline-none font-mono leading-relaxed selectable"
          />
        )}
      </div>
    </div>
  );
}
