/**
 * Models feature — inline two-button delete confirmation.
 *
 * Replaces the trash icon in a row when the user clicks delete. Auto
 * cancels after 4 seconds so a stray click never leaves a row stuck in a
 * destructive state.
 */

import { useEffect, useRef } from 'react';

export interface DeleteConfirmProps {
  /** Called when the user confirms — should perform the delete. */
  onConfirm: () => void;
  /** Called when the user explicitly cancels or the auto-timeout fires. */
  onCancel: () => void;
  /** Auto-cancel timeout in ms. Defaults to 4000. */
  timeoutMs?: number;
}

export function DeleteConfirm({ onConfirm, onCancel, timeoutMs = 4000 }: DeleteConfirmProps) {
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const t = setTimeout(() => cancelRef.current(), timeoutMs);
    return () => clearTimeout(t);
  }, [timeoutMs]);

  return (
    <div
      className="flex items-center gap-1.5 text-xs"
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Confirm delete"
    >
      <span className="text-zinc-400">Delete?</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onConfirm();
        }}
        className="px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors duration-150"
      >
        Yes
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors duration-150"
      >
        No
      </button>
    </div>
  );
}
