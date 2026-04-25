/**
 * Workspaces feature — "Save current as..." modal.
 *
 * Self-contained form. Owns:
 *   - the `name` input (autofocused)
 *   - a live preview of the snapshot the parent will persist
 *   - submit (calls the parent's `onSubmit({ name })`) and cancel (Esc /
 *     backdrop / Cancel button / X)
 *
 * The parent (typically `WorkspacesScreen` or the `QuickSwitcher`) owns the
 * actual `useWorkspaces().saveCurrent` call so this modal can be reused for
 * any "give the current layout a name" flow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Save, X } from 'lucide-react';
import { snapshotCurrentLayout } from './useWorkspaces';
import { PANE_COUNT_BY_LAYOUT } from './types';

const INPUT_CLASS =
  'w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500 outline-none transition-colors duration-150';

const LABEL_CLASS = 'block text-xs font-medium text-zinc-400 mb-1';

export interface SaveModalProps {
  /** Called with the trimmed name when the user submits. */
  onSubmit: (opts: { name: string }) => Promise<unknown> | unknown;
  /** Called when the user cancels (Esc, backdrop, X, Cancel). */
  onClose: () => void;
  /** Initial value for the name input. Defaults to a date-based suggestion. */
  initialName?: string;
}

function defaultName(): string {
  const d = new Date();
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Workspace · ${date} ${time}`;
}

export function SaveModal({ onSubmit, onClose, initialName }: SaveModalProps) {
  const [name, setName] = useState<string>(() => initialName ?? defaultName());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Snapshot the layout once when the modal opens so the preview is stable
  // even if the user clicks around behind a transparent backdrop.
  const snapshot = useMemo(() => snapshotCurrentLayout(), []);
  const boundCount = useMemo(
    () => snapshot.panes.filter((p) => p.sessionId).length,
    [snapshot],
  );
  const totalPanes = PANE_COUNT_BY_LAYOUT[snapshot.layout];

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) {
        setError('Name is required.');
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        await onSubmit({ name: trimmed });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save workspace.');
      } finally {
        setSubmitting(false);
      }
    },
    [name, onClose, onSubmit],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Save workspace"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-4 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Save size={14} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-100">Save workspace</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor="workspace-name" className={LABEL_CLASS}>
              Name
            </label>
            <input
              id="workspace-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Refactoring sprint"
              className={INPUT_CLASS}
              spellCheck
            />
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5">
              Preview
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <LayoutGrid size={13} className="text-amber-500" />
              <span className="font-mono text-zinc-200">{snapshot.layout}</span>
              <span className="text-zinc-600">·</span>
              <span>
                {boundCount} of {totalPanes} pane{totalPanes === 1 ? '' : 's'} bound
              </span>
            </div>
            {boundCount > 0 ? (
              <ul className="mt-2 space-y-1 text-[11px] font-mono text-zinc-500">
                {snapshot.panes.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="text-zinc-600">{p.id}</span>
                    <span className="text-zinc-700">→</span>
                    <span className={p.sessionId ? 'text-zinc-300' : 'text-zinc-700 italic'}>
                      {p.sessionId ?? 'empty'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-600 italic">
                No sessions are currently bound. The empty layout will still be saved.
              </p>
            )}
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 transition-colors duration-150 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Save size={13} />
            {submitting ? 'Saving...' : 'Save workspace'}
          </button>
        </div>
      </form>
    </div>
  );
}
