import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnectionStore } from '@/stores/connection';
import type { SoulResponse } from '@/api/types';

export function SoulScreen() {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getClient = useConnectionStore((s) => s.getClient);

  const fetchData = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res: SoulResponse = await client.getSoul();
      setContent(res.content || '');
      setOriginalContent(res.content || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SOUL.md');
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveContent = useCallback(
    (newContent: string) => {
      const client = getClient();
      if (!client) return;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      setContent(newContent);

      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        setError(null);
        try {
          const res: SoulResponse = await client.patchSoul({ content: newContent });
          setOriginalContent(res.content || '');
          setSavedAt(Date.now());
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to save');
          setContent(originalContent);
        } finally {
          setSaving(false);
        }
      }, 800);
    },
    [getClient, originalContent]
  );

  const lineCount = content ? content.split('\n').length : 0;
  const charCount = content.length;
  const isModified = content !== originalContent;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading SOUL.md...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-200">SOUL.md</h2>
            <span className="text-xs text-zinc-600">{lineCount} lines / {charCount > 1000 ? `${(charCount / 1024).toFixed(1)}K` : `${charCount}`} chars</span>
          </div>
          <div className="flex items-center gap-2">
            {isModified && (
              <span className="text-xs text-amber-400">Unsaved changes</span>
            )}
            {saving && (
              <span className="text-xs text-amber-400">Saving...</span>
            )}
            {savedAt && !saving && !isModified && (
              <span className="text-xs text-emerald-400 animate-fade-in">Saved</span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4">
        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 mb-3">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-300">x</button>
          </div>
        )}

        <textarea
          value={content}
          onChange={(e) => saveContent(e.target.value)}
          className="w-full h-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 resize-none focus:border-amber-500 outline-none font-mono leading-relaxed selectable"
          placeholder="No SOUL.md content yet."
          spellCheck={false}
        />
      </div>
    </div>
  );
}
