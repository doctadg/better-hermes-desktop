# Memory editor++ — integration notes

Phase 1, feature 1E. Replaces `src/components/screens/MemoryScreen.tsx` with a
multi-tab editor under `src/features/memory/`.

## Files in this feature

- `MemoryScreen.tsx`   — top-level shell, three tabs (Entries / Profile / Providers)
- `EntriesTab.tsx`     — MEMORY.md split on `\n§\n`, per-entry Save/Delete/Duplicate
- `ProfileTab.tsx`     — USER.md single textarea, debounced auto-save (800ms)
- `ProvidersTab.tsx`   — read-only catalogue of long-term memory providers
- `CapacityBar.tsx`    — thin progress bar (emerald < 70% < amber < 90% < rose)
- `providers.ts`       — provider catalogue (id, label, description, urls, env var)

## App.tsx wiring

Replace the existing memory nav entry/route. The id stays `memory`.

```ts
// 1. Update the import:
import { MemoryScreen } from '@/features/memory/MemoryScreen';
//    (remove the old `import { MemoryScreen } from '@/components/screens/MemoryScreen';`)

// 2. Update the nav definition:
{
  id: 'memory',
  label: 'Memory',
  icon: <Brain size={18} />,   // from 'lucide-react'
}
```

The render-switch line stays the same:

```tsx
{activeNav === 'memory' && <MemoryScreen />}
```

## Constraints honoured

- No new IPC handlers, no new `client.ts` methods, no new npm packages.
- Uses existing `client.getMemory()` / `patchMemory()` / `getUserProfile()` /
  `patchUserProfile()` from `@/api/client` (the spec's `updateMemory` /
  `updateUserProfile` were aliases for these).
- `MemoryResponse` contract (`{ file, content, line_count, char_count, last_modified }`)
  is the typed shape; tabs read optional `charLimit` / `charCount` extensions
  with a `?? DEFAULT` fallback (2200 for MEMORY.md, 1375 for USER.md).
- `window.hermesAPI.storeGet` is read via a narrow local cast — the global
  `HermesAPI` type in `src/api/types.ts` is left untouched. Env vars are
  looked up under the key `env.<VAR_NAME>`.
- "Open dashboard" / "Setup docs" use the existing `open-external` IPC channel.
- `useConnectionStore(s => s.client)` gates each tab; null shows a
  "No connection" placeholder.
- The legacy `src/components/screens/MemoryScreen.tsx` is left in place so
  this feature can land independently of the App.tsx swap.

## Lucide icons used

`Brain`, `Plus`, `Save`, `Trash2`, `Copy`, `ExternalLink`, `User`
