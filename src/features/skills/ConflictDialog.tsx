/**
 * ConflictDialog — modal shown when `useSkills().save()` rejects with
 * `ConflictError`. Mirrors dodo's UX: explain the drift, expose both
 * hashes, and offer "Reload from server" (overwrite the editor with
 * server content) or "Cancel" (keep local edits, retry decision is
 * left to the user).
 */

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ConflictError } from './types';

interface ConflictDialogProps {
  /** The error thrown by `save()`. Carries both hashes and latest content. */
  error: ConflictError;
  /**
   * Called when the user picks "Reload from server". The parent should
   * replace the editor body with `error.latestContent` and refresh the
   * recorded hash. Modal is dismissed by the parent in response.
   */
  onReload: () => void;
  /** Called when the user picks "Cancel" or hits Escape. */
  onCancel: () => void;
}

export function ConflictDialog({ error, onReload, onCancel }: ConflictDialogProps) {
  // Close on Escape — mirrors the rest of the app's dialog conventions.
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
      aria-labelledby="skill-conflict-title"
    >
      <div
        className="w-[420px] max-w-[90vw] rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="shrink-0 rounded-full bg-amber-500/10 p-2 text-amber-400">
            <AlertCircle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="skill-conflict-title" className="text-sm font-semibold text-zinc-100">
              Skill changed on the server
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              The SKILL.md file was modified on the server after you opened
              it here. Saving now would overwrite that newer copy. Reload to
              see the latest version, then re-apply your edits.
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-5 text-[11px] font-mono text-zinc-500">
          <dt className="text-zinc-600">expected</dt>
          <dd className="truncate text-zinc-300">{error.expectedHash}</dd>
          <dt className="text-zinc-600">actual</dt>
          <dd className="truncate text-amber-400">{error.actualHash}</dd>
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
