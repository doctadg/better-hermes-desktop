# Soul (Persona) — integration

## Nav entry
- id: `soul`
- label: `Persona`
- icon: `Heart` (lucide-react)

## App.tsx wiring
Replace the existing render for Soul:

```tsx
import { SoulScreen } from '@/features/soul/SoulScreen';

// in renderScreen():
case 'soul':
  return <SoulScreen />;
```

The legacy `src/components/screens/SoulScreen.tsx` becomes dead after the swap.

## What ships
- `SoulScreen.tsx` — single-pane editor: header (filename, last-loaded, hash truncated, dirty dot), action buttons (Reload / Save), monospace textarea, footer (char count, YAML-frontmatter badge).
- `useSoulEditor.ts` — load/save with hash-based conflict detection (refetch + sha256 compare on save). Throws `ConflictError` when the server-side content moved while the user was editing.
- `sha256.ts` — SubtleCrypto wrapper, lowercase hex.
- `ConflictModal.tsx` — modal shown on save conflict. Two paths: Reload (discard local edits) or Force overwrite (re-save without re-checking, for power users).
- `yamlFrontmatter.ts` — pure helper to detect `---`-delimited frontmatter so the editor can hint at it.

## Required additions to shared files
- None — uses existing `client.getSoul()` / `client.updateSoul()`.

## Deps
None new (SubtleCrypto is browser-native).
