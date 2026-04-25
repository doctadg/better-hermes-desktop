/**
 * Workspaces feature — top-bar quick switcher.
 *
 * A compact dropdown that lists every saved workspace by name + layout
 * mode. Designed to mount in the App.tsx top bar next to `PaneHud`. When
 * the user clicks a workspace, we call `useWorkspaces.load(id)`. The
 * dropdown also exposes a "Save current..." item that opens the same
 * `SaveModal` the screen uses.
 *
 * The dropdown owns:
 *   - its open/closed state
 *   - the SaveModal mount
 *   - outside-click + Esc to close
 *
 * Errors during load surface as a small red strip inside the dropdown so
 * the user doesn't lose context (the top bar has no other place for them).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  LayoutGrid,
  Plus,
  Save,
} from 'lucide-react';
import { SaveModal } from './SaveModal';
import { useWorkspaces } from './useWorkspaces';
import type { SavedWorkspace } from './types';

export interface QuickSwitcherProps {
  /** Optional className passthrough for the trigger button. */
  className?: string;
}

export function QuickSwitcher({ className }: QuickSwitcherProps) {
  const { workspaces, loading, error, saveCurrent, load } = useWorkspaces();

  const [open, setOpen] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Esc when open.
  useEffect(() => {
    if (!open) return;

    function onDocClick(e: MouseEvent): void {
      if (!wrapperRef.current) return;
      if (e.target instanceof Node && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleLoad = useCallback(
    async (ws: SavedWorkspace) => {
      setBusyId(ws.id);
      setActionError(null);
      try {
        await load(ws.id);
        setOpen(false);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to load workspace.');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const triggerLabel = useMemo(() => {
    if (loading) return 'Workspaces...';
    if (workspaces.length === 0) return 'Workspaces';
    return `Workspaces (${workspaces.length})`;
  }, [loading, workspaces.length]);

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 transition-colors duration-150 ${
          open
            ? 'bg-zinc-800 text-amber-400'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
        }`}
        title="Saved workspaces"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <LayoutGrid size={12} />
        <span>{triggerLabel}</span>
        <ChevronDown
          size={11}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-40 w-72 max-h-[60vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl"
        >
          {/* Save action — always at the top */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setShowSave(true);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900 border-b border-zinc-800"
          >
            <Save size={13} className="text-amber-500" />
            <span>Save current as...</span>
          </button>

          {actionError && (
            <div className="mx-3 my-2 text-[11px] text-red-400 bg-red-900/20 border border-red-800 rounded-md px-2 py-1.5">
              {actionError}
            </div>
          )}

          {error && (
            <div className="mx-3 my-2 text-[11px] text-red-400 bg-red-900/20 border border-red-800 rounded-md px-2 py-1.5">
              {error}
            </div>
          )}

          {workspaces.length === 0 && !loading && !error ? (
            <div className="px-3 py-3 text-[11px] text-zinc-500 italic flex items-center gap-1.5">
              <Plus size={11} />
              No saved workspaces yet.
            </div>
          ) : (
            <ul className="py-1">
              {workspaces.map((ws) => {
                const boundCount = ws.snapshot.panes.filter((p) => p.sessionId).length;
                const isBusy = busyId === ws.id;
                return (
                  <li key={ws.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleLoad(ws)}
                      disabled={isBusy}
                      className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-zinc-900 transition-colors duration-150 disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-zinc-200 truncate">
                          {ws.name}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {ws.snapshot.layout} · {boundCount} bound
                        </div>
                      </div>
                      {isBusy && (
                        <span className="inline-block w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {showSave && (
        <SaveModal
          onSubmit={async ({ name }) => {
            await saveCurrent({ name });
          }}
          onClose={() => setShowSave(false)}
        />
      )}
    </div>
  );
}
