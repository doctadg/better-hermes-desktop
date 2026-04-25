# Workspaces feature — integration notes

This feature is fully self-contained under `src/features/workspaces/`. It
uses the existing `window.hermesAPI.workspaces.{ list, save, remove }`
bridge shipped in Phase 0 (commit `79d7968`) — no new IPC, no new preload
surface, no new client.ts methods, no new dependencies.

A "workspace" is a named snapshot of the current `useLayoutStore` state:
the grid mode (`'1x1' | '2x1' | '2x2'`), the per-pane sessionId bindings,
and the focused pane. Loading a workspace dispatches `setLayout` +
`setPaneSession` on the layout store and `ensureSession` on the chat store
for every bound session — no new store methods are introduced.

This is a beyond-parity feature: neither `fathah` nor `dodo-reach` ships it.

## Files

| File | Purpose |
| ---- | ------- |
| `types.ts` | Re-exports `WorkspaceRow` from `@electron/preload`, defines `WorkspaceLayoutSnapshot` + `SavedWorkspace`, and exposes `parseWorkspaceRow` / `parseWorkspaceSnapshot` runtime validators that drop malformed records. Also exports `LAYOUT_VALUES`, `PANE_COUNT_BY_LAYOUT`, and `generateWorkspaceId`. |
| `useWorkspaces.ts` | React hook `{ workspaces, loading, error, refresh, saveCurrent, load, remove, rename }` over the preload bridge. Also exports `snapshotCurrentLayout()` so other components (e.g. the SaveModal preview) can inspect what would be saved. |
| `WorkspacesScreen.tsx` | Top-level screen — header with title + "Save current as..." button, responsive card grid, inline rename (Enter to confirm, Esc to cancel), inline two-button delete confirm, empty-state CTA. |
| `SaveModal.tsx` | Modal — name input (autofocused), live snapshot preview (layout mode + per-pane bindings), Esc/backdrop/Cancel close, Submit calls the parent-supplied `onSubmit({ name })`. |
| `QuickSwitcher.tsx` | Compact dropdown for the top bar — lists saved workspaces by name + layout mode, "Save current..." item at the top, outside-click + Esc to close. |

## Wiring into the shell

### 1. Nav entry

Add a sidebar / nav entry that mounts `WorkspacesScreen`:

```tsx
import { LayoutGrid } from 'lucide-react';
import { WorkspacesScreen } from '@/features/workspaces/WorkspacesScreen';

const navEntry = { id: 'workspaces', label: 'Workspaces', icon: 'LayoutGrid' };

// in the route/screen switch (App.tsx renderScreen):
case 'workspaces':
  return <WorkspacesScreen />;
```

- `id`: `'workspaces'`
- `label`: `'Workspaces'`
- `icon`: `<LayoutGrid size={18} />` (from `lucide-react`)

### 2. Top-bar QuickSwitcher

Mount `QuickSwitcher` in the App.tsx top bar next to `PaneHud` so users can
load any saved workspace from anywhere in the app:

```tsx
import { QuickSwitcher } from '@/features/workspaces/QuickSwitcher';

<div className="no-drag flex items-center gap-2 shrink-0">
  <PaneHud />
  <QuickSwitcher />
  {/* ...existing command-palette button, context-toggle button... */}
</div>
```

The `QuickSwitcher` is self-contained: it owns its own dropdown state,
mounts its own `SaveModal` when the user picks "Save current...", and
closes on outside-click / Esc.

### 3. Hotkey (out of scope — document only)

Reserve `Cmd+\d` (where `d` is a digit, e.g. `Cmd+\1`, `Cmd+\2`, ...) for
loading the Nth saved workspace. Implementation is **out of scope for this
phase** — when wired, the handler should call:

```ts
import { useWorkspaces } from '@/features/workspaces/useWorkspaces';

const { workspaces, load } = useWorkspaces();
const target = workspaces[digit - 1];
if (target) await load(target.id);
```

The natural place for this is the existing global-shortcut `useEffect` in
`App.tsx` (the same block that hosts `Cmd+K`, `Cmd+T`, etc).

## What this feature does NOT touch

- `App.tsx` — caller wires the route entry and the QuickSwitcher mount.
- `src/stores/layout.ts` / `src/stores/chat.ts` — read via existing exports
  only (`useLayoutStore.getState()`, `useChatStore.getState().ensureSession`,
  `setLayout`, `setPaneSession`). No new actions are added.
- `src/api/*` — no new HTTP or WS methods.
- `electron/*` — relies on the existing `workspaces.*` preload surface.
- `package.json` — no new dependencies (uses only `lucide-react`, already
  a dep, plus `react`).

## Snapshot shape

A `WorkspaceLayoutSnapshot` is JSON-encoded into the `layout` column of
the `workspaces` SQLite table. Shape:

```ts
{
  layout: '1x1' | '2x1' | '2x2',
  panes: Array<{ id: string, sessionId: string | null }>,
  focusedPaneId: string | null,
}
```

`parseWorkspaceRow` drops any row whose `layout` JSON fails to parse, has
the wrong `layout` literal, has the wrong number of panes for the declared
mode, or has malformed `panes[].id` / `panes[].sessionId` values. A
`focusedPaneId` that doesn't reference any of the listed panes is silently
reset to `null` rather than rejecting the whole row.

## Load semantics

`useWorkspaces.load(id)` performs three steps in order:

1. Calls `useLayoutStore.getState().setLayout(snapshot.layout)`. The
   layout store rebuilds `panes` to match the new mode, preserving any
   existing bindings by index.
2. For each pane in the snapshot, calls
   `useLayoutStore.getState().setPaneSession(livePaneId, savedSessionId)`.
   Bindings are matched by index (which is also id-stable today: pane ids
   are `pane_0`, `pane_1`, ...).
3. For each non-null `sessionId`, calls
   `useChatStore.getState().ensureSession(sessionId)` so the pane's
   `ChatView` can mount cleanly with a fresh slice. The chat store's
   `merge` pass on rehydration takes care of pulling the message history
   from SQLite.

`focusedPaneId` is currently not restored explicitly — `setLayout` already
keeps the previously-focused pane focused if it exists in the new layout,
which matches the snapshot's pane in the common case.

## Constraints honored

- ONLY files under `src/features/workspaces/` were created.
- Strict TS, passes `npx tsc -p tsconfig.json --noEmit`.
- Tailwind only (`bg-zinc-950` / `bg-zinc-900` / `border-zinc-800` /
  `text-zinc-100` / accent `text-amber-500`).
- Inputs use `px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl
  focus:border-amber-500 outline-none`.
- Icons sourced exclusively from `lucide-react`: `LayoutGrid`, `Save`,
  `Plus`, `Trash2`, `Edit3`, `Check`, `X`, plus `ChevronDown` for the
  switcher caret.
- No new IPC, no new preload surface, no new client.ts methods.
- No new npm dependencies, no git commit.
