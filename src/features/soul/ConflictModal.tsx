/**
 * ConflictModal — shown when `useSoulEditor().save()` rejects with a
 * `ConflictError`. Mirrors the dodo / FileEditorService UX:
 *
 *   - explain that SOUL.md drifted on the server
 *   - show both hashes (truncated) so the user can verify it isn't a phantom
 *   - offer two actions: "Reload from server" (replace editor with latest)
 *     or "Force overwrite" (write our buffer regardless of drift)
 *
 * The modal is otherwise dismiss-on-Escape / dismiss-on-backdrop, matching
 * the rest of the app's dialogs.
 */

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Save } from 'lucide-react';
import type { ConflictError } from './useSoulEditor';

interface ConflictModalProps {
  /** The error thrown by `save()`. Carries both hashes and latest content. */
  error: ConflictError;
  /**
   * Called when the user picks "Reload from server". The parent should run
   * `useSoulEditor().load()` and then dismiss the modal.
   */
  onReload: () => void;
  /**
   * Called when the user picks "Force overwrite". The parent should run
   * `useSoulEditor().forceSave()` and then dismiss the modal.
   */
  onForceOverwrite: () => void;
  /** Called when the user picks Cancel, hits Escape, or clicks the backdrop. */
  onCancel: () => void;
}

export function ConflictModal({
  error,
  onReload,
  onForceOverwrite,
  onCancel,
}: ConflictModalProps) {
  // Close on Escape — matches the rest of the app's dialog conventions.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="soul-conflict-title"
    >
      <div
        className="w-[460px] max-w-[90vw] rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="shrink-0 rounded-full bg-amber-500/10 p-2 text-amber-500">
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="soul-conflict-title"
              className="text-sm font-semibold text-zinc-100"
            >
              SOUL.md changed on the server while you were editing.
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Reload to take the server's version (you'll lose your edits) or
              force overwrite to push your buffer regardless.
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-5 text-[11px] font-mono text-zinc-500">
          <dt className="text-zinc-600">expected</dt>
          <dd className="truncate text-zinc-300">{error.expectedHash}</dd>
          <dt className="text-zinc-600">actual</dt>
          <dd className="truncate text-amber-500">{error.actualHash}</dd>
        </dl>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onForceOverwrite}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors duration-150"
          >
            <Save size={12} />
            Force overwrite
          </button>
          <button
            type="button"
            onClick={onReload}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-amber-400 transition-colors duration-150"
          >
            <RefreshCw size={12} />
            Reload from server
          </button>
        </div>
      </div>
    </div>
  );
}
