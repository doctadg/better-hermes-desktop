/**
 * Workspaces feature — shared types.
 *
 * A "workspace" is a named snapshot of the multi-pane chat layout: the grid
 * mode (`'1x1'|'2x1'|'2x2'`), the per-pane sessionId bindings, and the
 * focused pane. The snapshot is JSON-encoded into the `layout` column of
 * the SQLite-backed `workspaces` table shipped in Phase 0.
 *
 * `WorkspaceRow` is the raw row shape (defined in `electron/preload.ts`)
 * with `layout` as an opaque JSON string. `SavedWorkspace` is the parsed,
 * validated view used by the UI.
 *
 * `LAYOUT_VALUES` is the canonical tuple of allowed grid modes. We mirror
 * the literal union from `src/stores/layout.ts` here rather than importing
 * the type, so the validator can use it as a runtime allowlist without
 * pulling in any zustand machinery at module-load time.
 */
import type { WorkspaceRow as PreloadWorkspaceRow } from '@electron/preload';

export type WorkspaceRow = PreloadWorkspaceRow;

/** Allowed grid modes. Mirror of `Layout` from `src/stores/layout.ts`. */
export const LAYOUT_VALUES = ['1x1', '2x1', '2x2'] as const;
export type WorkspaceLayoutMode = (typeof LAYOUT_VALUES)[number];

/** Per-pane binding inside a snapshot. */
export interface WorkspacePaneBinding {
  id: string;
  sessionId: string | null;
}

/** Snapshot of the layout store at the time of save. */
export interface WorkspaceLayoutSnapshot {
  layout: WorkspaceLayoutMode;
  panes: WorkspacePaneBinding[];
  focusedPaneId: string | null;
}

/** Parsed view of a workspace row — snapshot is the decoded `layout` column. */
export interface SavedWorkspace {
  id: string;
  name: string;
  /** Original JSON string from the row, kept verbatim for round-tripping. */
  rawLayout: string;
  snapshot: WorkspaceLayoutSnapshot;
  created_at: number;
  updated_at: number;
}

/** Number of panes implied by each grid mode. */
export const PANE_COUNT_BY_LAYOUT: Record<WorkspaceLayoutMode, number> = {
  '1x1': 1,
  '2x1': 2,
  '2x2': 4,
};

/**
 * Runtime validator: returns `null` for malformed input. Used to drop
 * corrupt rows when listing.
 *
 * A snapshot is considered well-formed iff:
 *   - `layout` is one of `LAYOUT_VALUES`,
 *   - `panes` is an array of `{ id: string, sessionId: string | null }`
 *     with length equal to `PANE_COUNT_BY_LAYOUT[layout]`,
 *   - `focusedPaneId` is `null` or a string referencing one of the panes.
 *
 * Older rows produced before this feature existed are tolerated as long as
 * the JSON parses to the right shape. Anything else is rejected entirely.
 */
export function parseWorkspaceSnapshot(input: unknown): WorkspaceLayoutSnapshot | null {
  if (input === null || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;

  const layout = obj.layout;
  if (typeof layout !== 'string') return null;
  if (!LAYOUT_VALUES.includes(layout as WorkspaceLayoutMode)) return null;
  const layoutMode = layout as WorkspaceLayoutMode;

  const panesRaw = obj.panes;
  if (!Array.isArray(panesRaw)) return null;
  if (panesRaw.length !== PANE_COUNT_BY_LAYOUT[layoutMode]) return null;

  const panes: WorkspacePaneBinding[] = [];
  for (const p of panesRaw) {
    if (p === null || typeof p !== 'object') return null;
    const pane = p as Record<string, unknown>;
    if (typeof pane.id !== 'string' || pane.id.length === 0) return null;
    if (pane.sessionId !== null && typeof pane.sessionId !== 'string') return null;
    panes.push({ id: pane.id, sessionId: pane.sessionId });
  }

  const focusedRaw = obj.focusedPaneId;
  let focusedPaneId: string | null;
  if (focusedRaw === null || focusedRaw === undefined) {
    focusedPaneId = null;
  } else if (typeof focusedRaw === 'string' && panes.some((p) => p.id === focusedRaw)) {
    focusedPaneId = focusedRaw;
  } else {
    // Unknown focused pane — drop it but keep the snapshot.
    focusedPaneId = null;
  }

  return { layout: layoutMode, panes, focusedPaneId };
}

/**
 * Try to parse a `WorkspaceRow` into a `SavedWorkspace`. Returns `null` if
 * the row's `layout` JSON is malformed or the snapshot fails validation.
 */
export function parseWorkspaceRow(row: WorkspaceRow): SavedWorkspace | null {
  let json: unknown;
  try {
    json = JSON.parse(row.layout);
  } catch {
    return null;
  }
  const snapshot = parseWorkspaceSnapshot(json);
  if (!snapshot) return null;
  return {
    id: row.id,
    name: row.name,
    rawLayout: row.layout,
    snapshot,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Generate a stable, URL-safe id for a new workspace. */
export function generateWorkspaceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
