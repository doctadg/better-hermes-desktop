# Skills feature — integration notes (1F)

This folder ships the new full skill manager (browser + installer + SKILL.md
editor with hash-based conflict detection). It is self-contained and does
not modify any shared file. Phase-1 wiring is documented below.

## Wiring into the nav

In `src/App.tsx`, replace the existing `skills` entry in `NAV_ITEMS` and the
`renderScreen()` switch with the new feature module. Use the canonical
`Sparkles` lucide icon to match the rest of the lucide migration:

```tsx
import { Sparkles } from 'lucide-react';
import { SkillsScreen } from '@/features/skills/SkillsScreen';

// NAV_ITEMS[…]
{
  id: 'skills',
  label: 'Skills',
  icon: <Sparkles size={18} />,
},

// renderScreen() …
case 'skills':
  return <SkillsScreen />;
```

The legacy `src/components/screens/SkillsScreen.tsx` can stay during the
swap so the build stays green; it becomes dead once the import is moved
and is safe to delete in a follow-up cleanup.

## Files in this folder

| File | Purpose |
| --- | --- |
| `SkillsScreen.tsx` | Split-pane UI: list (search/category/tabs) + detail editor + footer. |
| `useSkills.ts` | Hook: `{ skills, loading, error, refresh, install, uninstall, loadDetail, save }`. Owns hash-based conflict detection in `save()`. |
| `ConflictDialog.tsx` | Modal shown when `save()` rejects with `ConflictError`. Offers "Reload from server" / "Cancel". |
| `sha256.ts` | `async sha256(text)` → lowercase hex, via `crypto.subtle.digest`. Matches dodo's SHA-256/UTF-8 hashing scheme. |
| `types.ts` | Local types: `SkillItem`, `SkillDetail`, `SkillsResponseShape`, `ConflictError`, plus `adaptSkillInfoList()`. |

No new npm dependencies. Uses only lucide-react icons already in
`package.json` (`Sparkles`, `Search`, `Plus`, `RefreshCw`, `Save`, `Trash2`,
`FileText`, `Folder`, `AlertCircle`).

## Server / client gaps (out of scope for 1F)

This feature is intentionally additive — it never touches `src/api/client.ts`
or `electron/preload.ts`. Several methods called by `useSkills()` therefore
fall back to a graceful degradation path so Phase-1 still type-checks and
renders. Phase-2 should land the following on the central client:

### 1. `client.listSkills(): Promise<{ installed: SkillInfo[]; bundled: SkillInfo[] }>`

Currently `client.getSkills()` returns a flat `SkillsResponse = SkillInfo[]`
with no installed/bundled distinction and no `version` / `has_references`
/ `has_scripts` / `has_templates` / `source` fields. The hook adapts the
flat list via `adaptSkillInfoList()` — every entry lands in `installed`
and `bundled` is empty until the server exposes both buckets.

Suggested additions to `src/api/types.ts`:

```ts
export interface SkillItemDTO {
  id: string;
  name: string;
  description: string;
  category: string | null;
  version: string | null;
  source: 'installed' | 'bundled';
  installed: boolean;
  has_references: boolean;
  has_scripts: boolean;
  has_templates: boolean;
}

export interface SkillsListResponse {
  installed: SkillItemDTO[];
  bundled: SkillItemDTO[];
}
```

And a new method on `HermesClient`:

```ts
async listSkills(): Promise<SkillsListResponse> {
  const res = await fetch(`${this.baseUrl}/api/skills/list`, {
    headers: this.getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list skills: ${res.status}`);
  return res.json();
}
```

The hook also opportunistically calls `window.hermesAPI.invoke?.('skills.list')`
first — wiring an IPC handler with that name is an alternative path.

### 2. `client.getSkillContent(id): Promise<{ content: string; exists: boolean }>`

No equivalent exists today. The hook calls
`window.hermesAPI.invoke?.('skills.getContent', { id })` and falls back to
an empty stub (`{ content: '', exists: false }`) when the bridge is
missing — the editor stays usable for layout/UX review.

Suggested REST shape:

```
GET /api/skills/{id}/content → { content: string, exists: boolean }
```

Add to `HermesClient`:

```ts
async getSkillContent(id: string): Promise<{ content: string; exists: boolean }> {
  const res = await fetch(`${this.baseUrl}/api/skills/${encodeURIComponent(id)}/content`, {
    headers: this.getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to get skill content: ${res.status}`);
  return res.json();
}
```

### 3. `client.updateSkill(id, content, expectedHash): Promise<{ ok: boolean }>`

Same story — no current method. The hook calls
`window.hermesAPI.invoke?.('skills.update', { id, content, expectedHash })`
and treats a missing bridge as best-effort (the editor reflects the local
edit but the server is not modified).

The hash-based conflict check **already runs client-side** in
`useSkills.save()`: we re-fetch latest content, hash it, and throw
`ConflictError` if it drifts from `expectedHash`. The server endpoint
should perform the same check authoritatively (mirror dodo's
`skillWriteBody` in `SkillBrowserService.swift`) and return 409 on
mismatch so a future attacker-in-the-middle race is also caught.

Suggested REST shape:

```
PUT /api/skills/{id}/content
body: { content: string, expected_hash: string }
→ { ok: true } | 409 { ok: false, error: 'hash_mismatch', actual_hash: string }
```

### 4. `client.installSkill(id)` / `client.uninstallSkill(id)`

The hook currently delegates to `client.toggleSkill(id, true|false)` since
that is the only existing endpoint. When the server gains dedicated
install/uninstall verbs (which can do more than flip a flag — e.g. download
bundled skills, expand archives, etc.) the hook can swap to those without
any UI change.

## Hash algorithm contract

`sha256.ts` produces lowercase hex of `crypto.subtle.digest('SHA-256', utf8Bytes(text))`.
This matches:

- dodo's `hashlib.sha256(content_bytes).hexdigest()` in
  `Sources/HermesDesktop/Services/SkillBrowserService.swift` (`skillWriteBody`).
- Standard `sha256sum -` of the same UTF-8 bytes.

Keep this contract stable: any client/server that participates in the
optimistic-concurrency check must agree on the exact byte sequence being
hashed (no trailing-newline normalisation, no BOM stripping).
