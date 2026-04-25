# Sessions browser — integration notes

This feature ships a single screen, `SessionsScreen`, that browses and
full-text-searches the local SQLite cache populated in Phase 0
(`window.hermesAPI.sessions` / `window.hermesAPI.messages`).

The feature is **self-contained** — no edits were made to `App.tsx`,
`electron/preload.ts`, `ipc-handlers.ts`, `src/api/client.ts`, or
`package.json`. The wiring below is what the central integrator needs to do.

## 1. Mount the screen

In `src/App.tsx`:

```tsx
import { SessionsScreen } from '@/features/sessions/SessionsScreen';

// inside renderScreen():
case 'sessions':
  return <SessionsScreen />;
```

The current `case 'sessions'` placeholder ("Session browser coming soon.")
should be replaced.

## 2. Nav entry (already present)

`App.tsx` already has a `NavDef` for `sessions`. No new nav entry is needed.
For consistency with the rest of the codebase the suggested icon definition
(if/when nav icons migrate to `lucide-react`) is:

```ts
{ id: 'sessions', label: 'Sessions', icon: 'History' }
```

## 3. Listen for `hermes:open-session`

`SessionsScreen` dispatches a `CustomEvent` instead of importing the layout
store directly so the screen stays decoupled from pane plumbing. App-level
glue (recommended in `App.tsx`):

```tsx
useEffect(() => {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ sessionId: string }>).detail;
    if (!detail?.sessionId) return;
    ensureSession(detail.sessionId);
    assignToFocused(detail.sessionId);
    setActiveNav('chat'); // jump back to the pane grid
  };
  window.addEventListener('hermes:open-session', handler);
  return () => window.removeEventListener('hermes:open-session', handler);
}, [ensureSession, assignToFocused]);
```

`ensureSession` and `assignToFocused` come from `useChatStore` and
`useLayoutStore` respectively (both already in `App.tsx`).

## 4. Suggested hotkey: `Cmd+Shift+F`

Add to the global keydown handler in `App.tsx`:

```ts
if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
  e.preventDefault();
  setActiveNav('sessions');
}
```

This keeps the existing `Cmd+K` (palette) and `Cmd+T` (new session)
shortcuts unchanged.

## 5. Files

```
src/features/sessions/
  SessionsScreen.tsx     -- screen UI (top bar + browse / search modes)
  useSessions.ts         -- data hook over the Phase 0 IPC namespaces
  dateGrouping.ts        -- pure groupByDate helper (Today/Yesterday/Week/Earlier)
  SnippetHighlight.tsx   -- safe FTS5 <<...>> snippet renderer (no innerHTML)
  INTEGRATION.md         -- this file
```

## Caveats

- **`window.hermesAPI` typing.** The `HermesAPI` interface in
  `src/api/types.ts` predates Phase 0 and does not yet declare the
  `sessions` / `messages` namespaces. `useSessions.ts` therefore declares its
  own local interfaces matching `electron/preload.ts` and casts
  `window.hermesAPI` once on access. When `types.ts` is updated centrally,
  drop the local types and import from there.
- **Timestamp units.** `Session.started_at` from the cache is treated as
  **epoch ms** (per the feature spec). FTS hit timestamps from
  `messages.search` are still epoch **seconds** (consistent with the API's
  `SessionHistoryMessage.timestamp`) and are converted at format time inside
  `SessionsScreen`. Worth normalising once the schema settles.
- **`getSessionMessages` vs `getSessionHistory`.** The spec referenced
  `client.getSessionMessages(id)`; the actual client method is
  `client.getSessionHistory(id)`. The hook uses the real method.
- **Sync cost.** `syncFromServer` calls `getSessionHistory` for every session
  whose `message_count` differs from the local cache. For very large
  histories this is a chatty pass; we skip unchanged sessions to keep it
  cheap on subsequent syncs. Consider adding pagination or a "since"
  filter on the API side as a follow-up.
- **Profile filter.** The pill is read-only — switching profiles still
  happens via the existing `ProfilePicker` in the top bar. The hook
  re-loads the cache whenever `useConnectionStore.activeProfile` changes.
