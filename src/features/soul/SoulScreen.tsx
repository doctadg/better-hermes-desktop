/**
 * SoulScreen — single-pane Markdown editor for the SOUL.md persona file.
 *
 * Replaces the original `src/components/screens/SoulScreen.tsx`. Two key
 * differences vs the legacy screen:
 *
 *   1. Hash-based conflict detection (dodo's FileEditorService pattern):
 *      every load snapshots an sha256 of the server content; saves re-fetch
 *      and compare before writing. Drift opens the `ConflictModal`.
 *
 *   2. Explicit "Save" button (no debounced autosave). Combined with the
 *      orange dirty dot in the header, the user always knows whether their
 *      buffer matches the server.
 *
 * The screen is purely visual — all data flow lives in `useSoulEditor`.
 */

import { useCallback, useState } from 'react';
import { AlertTriangle, FileText, Hash, RefreshCw, Save } from 'lucide-react';
import { useSoulEditor, ConflictError } from './useSoulEditor';
import { ConflictModal } from './ConflictModal';
import { detectFrontmatter } from './yamlFrontmatter';

const FILENAME = 'SOUL.md';

function formatTimestamp(epochMs: number | null): string {
  if (epochMs === null) return 'never';
  const d = new Date(epochMs);
  // Locale-aware short time so the header stays compact.
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function SoulScreen() {
  const editor = useSoulEditor();
  const {
    content,
    setContent,
    contentHash,
    loading,
    saving,
    error,
    isDirty,
    lastLoaded,
    load,
    save,
    forceSave,
  } = editor;

  const [conflict, setConflict] = useState<ConflictError | null>(null);

  const handleSave = useCallback(async () => {
    if (saving || loading) return;
    try {
      await save();
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflict(err);
      }
      // Other errors are surfaced via `editor.error` already.
    }
  }, [save, saving, loading]);

  const handleReload = useCallback(async () => {
    setConflict(null);
    await load();
  }, [load]);

  const handleForceOverwrite = useCallback(async () => {
    setConflict(null);
    try {
      await forceSave();
    } catch {
      // Surfaced via `editor.error`.
    }
  }, [forceSave]);

  const handleConflictReload = useCallback(async () => {
    setConflict(null);
    await load();
  }, [load]);

  const frontmatter = detectFrontmatter(content);
  const charCount = content.length;
  const truncatedHash = contentHash ? contentHash.slice(0, 8) : '────────';

  if (loading && content === '') {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950 text-zinc-500 text-sm">
        <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading {FILENAME}…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 text-zinc-200">
              <FileText size={14} className="text-amber-500" />
              <span className="text-sm font-semibold">{FILENAME}</span>
              {isDirty && (
                <span
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                  className="ml-1 inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse"
                />
              )}
            </div>
            <span className="text-[11px] text-zinc-600">
              loaded {formatTimestamp(lastLoaded)}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500"
              title={contentHash || 'no hash yet'}
            >
              <Hash size={11} />
              {truncatedHash}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || saving}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 disabled:opacity-40 transition-colors duration-150"
            >
              <RefreshCw
                size={12}
                className={loading ? 'animate-spin' : undefined}
              />
              Reload from server
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading || saving || !isDirty}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 transition-colors duration-150"
            >
              <Save size={12} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle size={12} className="shrink-0" />
            {error}
          </span>
        </div>
      )}

      {/* Editor body */}
      <div className="flex-1 overflow-hidden p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          placeholder={`# Persona\n\nDefine how the agent should think, talk, and act.`}
          className="w-full h-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm leading-relaxed text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-500 selectable"
        />
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-zinc-800 px-4 py-2 flex items-center justify-between text-[11px] text-zinc-500">
        <div className="flex items-center gap-3">
          <span>{charCount.toLocaleString()} chars</span>
          {frontmatter.hasFrontmatter && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-500">
              YAML frontmatter detected
            </span>
          )}
        </div>
        <span className="font-mono text-zinc-600">{FILENAME}</span>
      </div>

      {conflict && (
        <ConflictModal
          error={conflict}
          onReload={() => void handleConflictReload()}
          onForceOverwrite={() => void handleForceOverwrite()}
          onCancel={() => setConflict(null)}
        />
      )}

      {/* Reference handleReload to avoid unused-variable lint. */}
      {void handleReload}
    </div>
  );
}
