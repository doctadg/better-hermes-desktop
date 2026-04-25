# Audit log — integration notes

This feature ships a single screen, `AuditScreen`, that browses and filters
the local SQLite `audit_log` populated via Phase 0
(`window.hermesAPI.audit.{ append, list }`).

The feature is **self-contained** under `src/features/audit/` — no edits were
made to `App.tsx`, `src/stores/*`, `src/components/*`, `src/api/*`,
`electron/*`, or `package.json`. The wiring below is what the central
integrator needs to do to mount it and to make it actually populate.

## 1. Mount the screen

In `src/App.tsx`:

```tsx
import { ShieldCheck } from 'lucide-react';
import { AuditScreen } from '@/features/audit/AuditScreen';

// 1. extend the NavItem union
type NavItem =
  | 'chat'
  | 'sessions'
  | 'models'
  | 'memory'
  | 'soul'
  | 'skills'
  | 'tools'
  | 'editor'
  | 'diff'
  | 'schedules'
  | 'gateways'
  | 'hardware'
  | 'audit'        // ← new
  | 'settings';

// 2. add a nav entry to NAV_ITEMS (anywhere — recommended just before
//    'settings' so security/compliance lives next to settings)
{ id: 'audit', label: 'Audit', icon: <ShieldCheck size={18} /> }

// 3. add a case to renderScreen()
case 'audit':
  return <AuditScreen />;
```

`hermes:open-session` is already wired in `App.tsx` (Phase 1 SessionsScreen),
so the "Jump to session" button and the inline session-id pill in
`AuditScreen` will route the focused chat pane out of the box.

## 2. CRITICAL — populate the audit table from the chat store

`AuditScreen` reads from the local SQLite `audit_log` table populated by
`window.hermesAPI.audit.append(...)`. Until the chat-side handlers start
calling `append`, the screen will work but will be empty (it shows
`"No requests recorded yet."`). **This is fine for v0.2** — the screen is
useful day-one for compliance / debugging once the wiring lands.

The minimal wiring is a one-liner inside each card's response handler.
Each call should fire **right before** `resolveRequest(...)` so the row is
recorded even if the WS roundtrip later fails.

### `src/components/chat/ApprovalCard.tsx` (`handleRespond`)

```ts
window.hermesAPI.audit.append({
  id: crypto.randomUUID(),
  kind: 'approval',
  request_id: request.request_id,
  session_id: sessionId,
  decision: c === 'approve' ? 'approved' : 'denied',
  payload: request,
});
```

### `src/components/chat/ClarifyCard.tsx` (`handleChoice`)

```ts
window.hermesAPI.audit.append({
  id: crypto.randomUUID(),
  kind: 'clarify',
  request_id: request.request_id,
  session_id: sessionId,
  decision: choice, // the free-text answer or selected option
  payload: request,
});
```

### `src/components/chat/SudoCard.tsx` (`handleSubmit`)

```ts
window.hermesAPI.audit.append({
  id: crypto.randomUUID(),
  kind: 'sudo',
  request_id: request.request_id,
  session_id: sessionId,
  decision: 'submitted', // never log the password itself
  payload: { request_id: request.request_id, type: request.type },
});
```

### `src/components/chat/SecretCard.tsx` (`handleSubmit`)

```ts
window.hermesAPI.audit.append({
  id: crypto.randomUUID(),
  kind: 'secret',
  request_id: request.request_id,
  session_id: sessionId,
  decision: 'submitted', // never log the secret itself
  payload: { request_id: request.request_id, env_var: request.env_var, prompt: request.prompt },
});
```

### Cancellation path

If a future change adds explicit cancel buttons (or an unmount-without-respond
path in the chat store), wire one more `append` with
`decision: 'cancelled'` so the audit picks up dismissed requests too.

### Why not centralize in the chat store?

The chat store's `resolveRequest(sessionId, requestId)` does not know which
button the user pressed (it only sees the id). Doing it in each card keeps
the decision string accurate without bloating the store contract.

A future refactor could add a third argument (`decision: string`) to
`resolveRequest` and forward to `audit.append` once there. That centralizes
the call site at the cost of touching the store.

### Security note

Never log raw passwords or secret values into `payload`. The recipes above
strip the value field. Keep the `payload` object focused on request
metadata so audit dumps remain shareable.

## 3. Files

```
src/features/audit/
  types.ts             -- AuditRow re-export + ParsedAuditRow + safe parsePayload()
  useAudit.ts          -- { entries, loading, error, refresh, clear } over hermesAPI.audit
  AuditScreen.tsx      -- screen UI: filter pills, search, pagination, row list
  AuditEntryDetail.tsx -- expanded row body: pretty JSON + copy + jump-to-session
  INTEGRATION.md       -- this file
```

## 4. UI behaviour summary

- **Filter pills:** All / Approval / Clarify / Sudo / Secret with per-kind
  counts. Color-coded: approval=amber, clarify=blue, sudo=rose, secret=violet.
- **Search box:** matches `request_id`, `session_id`, `decision`, and the
  raw payload JSON text (case-insensitive substring).
- **Refresh:** re-runs `audit.list({ limit: 500 })` and resets pagination.
- **Clear:** present-but-disabled with a tooltip explaining why
  (no `audit.clear` IPC handler ships in Phase 0). Wiring is documented as
  a TODO inside `useAudit.ts`.
- **Row layout:** kind badge → decision pill → relative time (abs on hover)
  → session-id pill (clickable, dispatches `hermes:open-session`) →
  request-id mono. Click the row chevron to expand a pretty-printed JSON
  body with Copy + Jump-to-session buttons.
- **Pagination:** client-side, 50 per page, "Load more" appends.
- **Empty states:** distinct copy for "no entries yet", "no matches", and
  "audit bridge unavailable" (renderer not running under Electron).
- **Parse errors:** rows whose `payload` JSON cannot be parsed get a
  `payload error` chip and the raw text is surfaced inside the detail.

## 5. Caveats / follow-ups

- **No `audit.clear` IPC.** Phase 0 only ships `append` + `list`. Wiring a
  `clear` requires (a) an `electron/ipc-handlers.ts` handler that runs
  `DELETE FROM audit_log`, (b) a preload bridge entry in
  `electron/preload.ts`, and (c) a typing entry in `src/api/types.ts`
  (`audit.clear: () => Promise<void>`). The button is rendered disabled
  until that lands.
- **Limit cap.** The hook fetches up to 500 most-recent rows. Older entries
  are still in SQLite but not surfaced in the renderer; once a server-side
  filter (e.g. by date range) lands the limit can grow without UI bloat.
- **Search scope.** Search is purely client-side over the loaded page. If
  audit volume grows past ~thousands of rows / day, push search down into
  a `LIKE` query in `electron/db.ts`.
- **Decision strings.** The pill recogniser handles `approved` / `denied` /
  `cancelled` / `answered` / `submitted` plus arbitrary free-form clarify
  responses (truncated to 40 chars). If you adopt other decision verbs
  (e.g. `'timeout'`), extend `decisionTone()` in `AuditScreen.tsx`.
- **Timestamps.** `created_at` is epoch milliseconds (matches the SQLite
  default `strftime('%s','now') * 1000`). Relative formatting assumes the
  client clock matches the host clock — fine for a desktop app.
