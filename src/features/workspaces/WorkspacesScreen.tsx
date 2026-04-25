/**
 * Workspaces feature — main screen.
 *
 * A grid of saved workspace "cards", each with:
 *   - title (inline-renameable)
 *   - layout-mode badge (1x1 / 2x1 / 2x2)
 *   - count of bound sessions
 *   - created / updated timestamps
 *   - Load / Rename / Delete actions
 *
 * Header has the title and a "Save current as..." button that opens the
 * `SaveModal`. Empty state shows a CTA pointing to the same modal.
 *
 * Loading the layout automatically dispatches `setLayout` + `setPaneSession`
 * on the layout store and `ensureSession` on the chat store for every bound
 * session — see `useWorkspaces.load`.
 */

import { useCallback, useState } from 'react';
import {
  Check,
  Edit3,
  LayoutGrid,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { SaveModal } from './SaveModal';
import { useWorkspaces } from './useWorkspaces';
import type { SavedWorkspace } from './types';

function formatTimestamp(ts: number): string {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(
    [],
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

export function WorkspacesScreen() {
  const { workspaces, loading, error, saveCurrent, load, remove, rename } = useWorkspaces();

  const [showSave, setShowSave] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleStartRename = useCallback((ws: SavedWorkspace) => {
    setRenamingId(ws.id);
    setRenameDraft(ws.name);
    setConfirmDeleteId(null);
    setActionError(null);
  }, []);

  const handleSubmitRename = useCallback(
    async (id: string) => {
      const name = renameDraft.trim();
      if (!name) {
        setActionError('Name is required.');
        return;
      }
      setBusyId(id);
      setActionError(null);
      try {
        await rename(id, name);
        setRenamingId(null);
        setRenameDraft('');
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to rename workspace.');
      } finally {
        setBusyId(null);
      }
    },
    [rename, renameDraft],
  );

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameDraft('');
    setActionError(null);
  }, []);

  const handleLoad = useCallback(
    async (id: string) => {
      setBusyId(id);
      setActionError(null);
      try {
        await load(id);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to load workspace.');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const handleConfirmDelete = useCallback(
    async (id: string) => {
      setBusyId(id);
      setActionError(null);
      try {
        await remove(id);
        setConfirmDeleteId(null);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to delete workspace.');
      } finally {
        setBusyId(null);
      }
    },
    [remove],
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm bg-zinc-950">
        <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading workspaces...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayoutGrid size={16} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-100">Workspaces</h2>
            <span className="text-xs text-zinc-600">
              {workspaces.length} saved
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSave(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 transition-colors duration-150"
          >
            <Save size={13} />
            Save current as...
          </button>
        </div>
      </div>

      {(error || actionError) && (
        <div className="mx-4 mt-3 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          {error ?? actionError}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {workspaces.length === 0 ? (
          <EmptyState onSave={() => setShowSave(true)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-4 py-4">
            {workspaces.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                isRenaming={renamingId === ws.id}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                isConfirmingDelete={confirmDeleteId === ws.id}
                isBusy={busyId === ws.id}
                onLoad={() => handleLoad(ws.id)}
                onStartRename={() => handleStartRename(ws)}
                onSubmitRename={() => handleSubmitRename(ws.id)}
                onCancelRename={handleCancelRename}
                onRequestDelete={() => {
                  setConfirmDeleteId(ws.id);
                  setRenamingId(null);
                  setActionError(null);
                }}
                onConfirmDelete={() => handleConfirmDelete(ws.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
              />
            ))}
          </div>
        )}
      </div>

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

interface WorkspaceCardProps {
  workspace: SavedWorkspace;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  isConfirmingDelete: boolean;
  isBusy: boolean;
  onLoad: () => void;
  onStartRename: () => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

function WorkspaceCard({
  workspace,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  isConfirmingDelete,
  isBusy,
  onLoad,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: WorkspaceCardProps) {
  const boundCount = workspace.snapshot.panes.filter((p) => p.sessionId).length;
  const totalPanes = workspace.snapshot.panes.length;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors duration-150 flex flex-col">
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={renameDraft}
                autoFocus
                onChange={(e) => onRenameDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSubmitRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancelRename();
                  }
                }}
                className="flex-1 min-w-0 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500 outline-none transition-colors duration-150"
                placeholder="Workspace name"
              />
              <button
                type="button"
                onClick={onSubmitRename}
                disabled={isBusy}
                className="p-1 rounded-md text-emerald-500 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
                title="Save name"
                aria-label="Save name"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onClick={onCancelRename}
                disabled={isBusy}
                className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
                title="Cancel rename"
                aria-label="Cancel rename"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <h3 className="text-sm font-semibold text-zinc-100 truncate" title={workspace.name}>
              {workspace.name}
            </h3>
          )}
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-800 text-[10px] font-mono text-amber-400 border border-zinc-700">
          <LayoutGrid size={10} />
          {workspace.snapshot.layout}
        </span>
      </div>

      {/* Stats */}
      <div className="px-3 pt-2 text-[11px] text-zinc-500 space-y-0.5">
        <div>
          {boundCount} of {totalPanes} pane{totalPanes === 1 ? '' : 's'} bound
        </div>
        <div className="text-zinc-600">
          Updated {formatTimestamp(workspace.updated_at)}
        </div>
        {workspace.created_at !== workspace.updated_at && (
          <div className="text-zinc-700">
            Created {formatTimestamp(workspace.created_at)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 px-3 pb-3 pt-2 border-t border-zinc-800/60 flex items-center gap-1.5">
        {isConfirmingDelete ? (
          <>
            <span className="text-[11px] text-zinc-400 mr-auto">Delete?</span>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={isBusy}
              className="px-2 py-1 text-[11px] font-medium rounded-md bg-red-500 hover:bg-red-600 text-zinc-950 transition-colors duration-150 disabled:opacity-40"
            >
              {isBusy ? 'Deleting...' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={isBusy}
              className="px-2 py-1 text-[11px] font-medium rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onLoad}
              disabled={isBusy || isRenaming}
              className="flex-1 px-2 py-1 text-xs font-medium rounded-md bg-amber-500 hover:bg-amber-600 text-zinc-950 transition-colors duration-150 disabled:opacity-40"
            >
              {isBusy ? 'Loading...' : 'Load'}
            </button>
            <button
              type="button"
              onClick={onStartRename}
              disabled={isBusy || isRenaming}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
              title="Rename workspace"
              aria-label="Rename workspace"
            >
              <Edit3 size={13} />
            </button>
            <button
              type="button"
              onClick={onRequestDelete}
              disabled={isBusy || isRenaming}
              className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
              title="Delete workspace"
              aria-label="Delete workspace"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onSave }: { onSave: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
        <LayoutGrid size={20} className="text-amber-500" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-200 mb-1">No saved workspaces</h3>
      <p className="text-xs text-zinc-500 max-w-sm mb-4">
        Save the current pane layout — including the grid mode and which session
        is bound to each pane — so you can switch back to it instantly later.
      </p>
      <button
        type="button"
        onClick={onSave}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 transition-colors duration-150"
      >
        <Plus size={14} />
        Save your first workspace
      </button>
    </div>
  );
}
