/**
 * Workspaces feature — React hook over `window.hermesAPI.workspaces.*`.
 *
 * The hook owns the saved-workspace list and exposes:
 *   - `workspaces` / `loading` / `error` / `refresh()`
 *   - `saveCurrent({ name, id? })` — snapshot the current `useLayoutStore`
 *     state and persist it (id auto-generated when missing).
 *   - `load(id)` — restore a saved snapshot onto the layout + chat stores.
 *   - `remove(id)` — delete a saved workspace.
 *   - `rename(id, name)` — keep snapshot, update name (+ updated_at via the
 *     preload `INSERT ... ON CONFLICT DO UPDATE` path).
 *
 * Malformed rows (broken JSON, missing fields) are silently dropped from
 * the listing, but they remain in the database so a future migration can
 * recover them. The runtime validator lives in `./types.ts`.
 *
 * The hook never imports from `electron/*` directly — only the
 * type-only `WorkspaceRow` re-export via `./types`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLayoutStore } from '@/stores/layout';
import { useChatStore } from '@/stores/chat';
import {
  generateWorkspaceId,
  parseWorkspaceRow,
  type SavedWorkspace,
  type WorkspaceLayoutSnapshot,
  type WorkspaceRow,
} from './types';

// ─── Local typing for the Phase-0 workspaces bridge ───
//
// Mirrors the shape exposed by `electron/preload.ts`. Kept here so this
// feature is a closed unit and we don't need to touch `src/api/types.ts`.
interface WorkspacesBridge {
  list: () => Promise<WorkspaceRow[]>;
  save: (w: { id: string; name: string; layout: unknown }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

interface PreloadShape {
  workspaces?: WorkspacesBridge;
}

function getBridge(): WorkspacesBridge | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { hermesAPI?: PreloadShape }).hermesAPI;
  return api?.workspaces ?? null;
}

export interface SaveCurrentOptions {
  /** Reuse an existing id (overwrite-in-place) or omit for a new record. */
  id?: string;
  /** Display name. Trimmed; rejected if empty. */
  name: string;
}

export interface UseWorkspacesResult {
  workspaces: SavedWorkspace[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveCurrent: (opts: SaveCurrentOptions) => Promise<SavedWorkspace>;
  load: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
}

/**
 * Build a `WorkspaceLayoutSnapshot` from the current `useLayoutStore`
 * state. Exposed for callers (e.g. the SaveModal preview) that want to
 * inspect what `saveCurrent` is about to persist.
 */
export function snapshotCurrentLayout(): WorkspaceLayoutSnapshot {
  const state = useLayoutStore.getState();
  return {
    layout: state.layout,
    panes: state.panes.map((p) => ({ id: p.id, sessionId: p.sessionId })),
    focusedPaneId: state.focusedPaneId,
  };
}

export function useWorkspaces(): UseWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<SavedWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const bridge = getBridge();
    if (!bridge) {
      setLoading(false);
      setError('Workspaces are unavailable (preload bridge missing).');
      setWorkspaces([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await bridge.list();
      const parsed: SavedWorkspace[] = [];
      for (const row of Array.isArray(rows) ? rows : []) {
        const ws = parseWorkspaceRow(row);
        if (ws) parsed.push(ws);
      }
      setWorkspaces(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveCurrent = useCallback(
    async ({ id, name }: SaveCurrentOptions): Promise<SavedWorkspace> => {
      const bridge = getBridge();
      if (!bridge) throw new Error('Workspaces are unavailable.');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Workspace name is required.');

      const snapshot = snapshotCurrentLayout();
      const finalId = id ?? generateWorkspaceId();
      await bridge.save({ id: finalId, name: trimmed, layout: snapshot });
      await refresh();

      const now = Date.now();
      return {
        id: finalId,
        name: trimmed,
        rawLayout: JSON.stringify(snapshot),
        snapshot,
        created_at: now,
        updated_at: now,
      };
    },
    [refresh],
  );

  const load = useCallback(
    async (id: string): Promise<void> => {
      const target = workspaces.find((w) => w.id === id);
      if (!target) throw new Error(`Workspace ${id} not found.`);

      const layoutStore = useLayoutStore.getState();
      const chatStore = useChatStore.getState();

      // 1. Switch to the saved grid mode. This rebuilds `panes` to the
      //    correct length, preserving any existing bindings by index — we
      //    overwrite them in step 2 anyway.
      layoutStore.setLayout(target.snapshot.layout);

      // 2. Re-read the (now-rebuilt) panes and assign each saved binding
      //    by id. If the saved snapshot uses different pane ids than the
      //    rebuilt store does (older snapshot, future store change), fall
      //    back to assigning by index.
      const after = useLayoutStore.getState();
      for (let i = 0; i < after.panes.length; i++) {
        const targetPane = target.snapshot.panes[i];
        if (!targetPane) continue;
        const livePaneId = after.panes[i]?.id;
        if (!livePaneId) continue;
        useLayoutStore.getState().setPaneSession(livePaneId, targetPane.sessionId);
        // 3. Make sure each bound session has a slice in the chat store
        //    so the pane's ChatView can mount cleanly.
        if (targetPane.sessionId) {
          chatStore.ensureSession(targetPane.sessionId);
        }
      }
    },
    [workspaces],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const bridge = getBridge();
      if (!bridge) throw new Error('Workspaces are unavailable.');
      await bridge.remove(id);
      await refresh();
    },
    [refresh],
  );

  const rename = useCallback(
    async (id: string, name: string): Promise<void> => {
      const bridge = getBridge();
      if (!bridge) throw new Error('Workspaces are unavailable.');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Workspace name is required.');
      const target = workspaces.find((w) => w.id === id);
      if (!target) throw new Error(`Workspace ${id} not found.`);

      // The preload `save` is upsert; reuse it with the existing snapshot.
      await bridge.save({ id, name: trimmed, layout: target.snapshot });
      await refresh();
    },
    [refresh, workspaces],
  );

  // Stable identity for the result — keeps consumers from re-rendering on
  // the workspaces list refresh alone if they only depend on actions.
  const result = useMemo<UseWorkspacesResult>(
    () => ({ workspaces, loading, error, refresh, saveCurrent, load, remove, rename }),
    [workspaces, loading, error, refresh, saveCurrent, load, remove, rename],
  );
  return result;
}
