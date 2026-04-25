# Models feature — integration notes

This feature is fully self-contained under `src/features/models/`. It uses
the existing `window.hermesAPI.models.{list, add, update, remove}` bridge
shipped in Phase 0 (commit `79d7968`) — no new IPC, no new preload
surface, no new client.ts methods, no new dependencies.

## Files

| File | Purpose |
| ---- | ------- |
| `types.ts` | Re-exports `ModelRow` from `@electron/preload` and defines `SavedModelDraft` + `ModelGroup`. |
| `providers.ts` | Hand-curated preset list (`PROVIDERS`) + `providerLabel`, `getProviderPreset`, `providerRequiresBaseUrl` helpers. |
| `useModels.ts` | React hook `{ models, loading, error, refresh, save, remove }` over the preload bridge. |
| `DeleteConfirm.tsx` | Inline two-button "Delete?" confirm with a 4-second auto-cancel. |
| `ModelEditorModal.tsx` | Add/edit modal — validates name/modelId, requires base URL for `custom`/local providers, auto-fills preset URLs, closes on Esc/backdrop. |
| `ModelsScreen.tsx` | Top-level screen — header + Add button, search box, collapsible provider sections, hover trash, empty state. |

## Wiring into the shell

Add a sidebar / nav entry that mounts `ModelsScreen`:

```tsx
import { ModelsScreen } from '@/features/models/ModelsScreen';

const navEntry = { id: 'models', label: 'Models', icon: 'Boxes' };

// in the route/screen switch:
case 'models':
  return <ModelsScreen />;
```

- `id`: `'models'`
- `label`: `'Models'`
- `icon`: `'Boxes'` (from `lucide-react`)
- No hotkey is registered for this screen.

## What this feature does NOT touch

- `App.tsx` — caller wires the route.
- `electron/preload.ts` — relies on the existing `models.*` surface only.
- `electron/ipc-handlers.ts` — no new handlers.
- `src/api/client.ts` — no new HTTP / WS methods.
- `package.json` — no new dependencies (uses only `lucide-react`, already a dep).

## Chat-pane model picker

The chat-pane model picker should populate from the same library, grouped
by provider so users immediately see structure:

```ts
import { providerLabel } from '@/features/models/providers';
import type { ModelRow } from '@/features/models/types';

const rows: ModelRow[] = await window.hermesAPI.models.list();

const grouped = rows.reduce<Record<string, ModelRow[]>>((acc, row) => {
  (acc[row.provider] ??= []).push(row);
  return acc;
}, {});

// Render groups in any order; use providerLabel(id) for headers.
```

The picker should call `providerLabel(row.provider)` for human-readable
section headers and surface `row.name` in the dropdown row, with
`row.model` as a mono subtitle. The same hook (`useModels`) can be reused
if reactive refresh is desired.

## Constraints honored

- ONLY files under `src/features/models/` were created.
- Strict TS, passes `npx tsc -p tsconfig.json --noEmit`.
- Tailwind only (`bg-zinc-950` / `bg-zinc-900` / `border-zinc-800` /
  `text-zinc-100` / accent `text-amber-500`).
- Inputs use `px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl
  focus:border-amber-500 outline-none`.
- Icons sourced exclusively from `lucide-react`: `Plus`, `Search`,
  `Trash2`, `ChevronDown`, `X`, `Boxes`.
