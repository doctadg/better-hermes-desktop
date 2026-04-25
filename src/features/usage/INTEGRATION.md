# Usage tracker — integration notes

Phase 2N. A self-contained per-session token-usage + estimated-cost tracker
that surfaces a small chip in the chat footer and a full breakdown modal.

The feature is **self-contained under `src/features/usage/`** — no edits were
made to `App.tsx`, `src/components/chat/*`, `src/stores/chat.ts`,
`src/api/*`, `electron/*`, or `package.json`. The wiring below is what the
central integrator needs to do.

## Files in this feature

```
src/features/usage/
  types.ts                  -- TokenUsage, SessionUsage, helpers
  usageStore.ts             -- zustand store (persist key: hermes-usage)
  UsageChip.tsx             -- compact pill for the chat footer
  UsageModal.tsx            -- full per-session breakdown modal
  useStreamUsageBridge.ts   -- mount-once hook that wires SSE → store
  INTEGRATION.md            -- this file
```

No new npm packages. Tailwind only. Lucide icons used: `Activity`,
`DollarSign`, `Zap`, `X`.

## 1. Mount the chip in the chat footer

**Recommended location:** `src/components/chat/InputBox.tsx`, in the
existing footer status row (around line 322 — the `<div className="flex
items-center justify-between mt-1.5 px-1">` block at the bottom of the
input container).

That row already shows hint kbds / streaming status / char count, so the
chip sits naturally beside them. The chip pulls `sessionId` from
`useSessionId()` (already available via `SessionProvider` wrapping the
chat tree) and reads `useSessionIsStreaming(sessionId)` for its
streaming-state coloring.

```tsx
// src/components/chat/InputBox.tsx
import { UsageChip } from '@/features/usage/UsageChip';

// inside the footer status row:
<div className="flex items-center justify-between mt-1.5 px-1">
  <span className="text-[10px] text-zinc-600 flex items-center gap-2">
    {/* ...existing hint chips / streaming status... */}
  </span>
  <div className="flex items-center gap-2">
    <UsageChip sessionId={sessionId} />
    {showCharCount && (
      <span className={`text-[10px] font-mono ${...}`}>
        {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
      </span>
    )}
  </div>
</div>
```

The chip is also safe to drop directly under `MessageList` (or in
`ChatView` between the list and the input) if a more prominent placement is
preferred — it self-contains its width and click handling.

## 2. Mount the bridge hook ONCE in App.tsx

```tsx
// src/App.tsx
import { useStreamUsageBridge } from '@/features/usage/useStreamUsageBridge';

function App() {
  useStreamUsageBridge(); // ← idempotent, no-op until chat store exposes events
  // ... rest of App
}
```

The bridge is **defensive**: if the chat store doesn't expose
`subscribeToUsage` (which it currently does not — see step 3), the hook is
a no-op and prints a single debug line. So mounting it now is safe.

## 3. Chat-store change required to actually capture usage

`src/stores/chat.ts` does **not** currently surface usage SSE events. Its
`sendMessage` SSE loop only handles three event types:

```ts
if (event.type === 'chunk')         { /* … */ }
else if (event.type === 'tool_progress') { /* … */ }
else if (event.type === 'done')     { break; }
```

To wire up real usage tracking, the chat store needs:

### 3a. Forward usage events from the SSE stream

The OpenAI-compatible Hermes API may emit a `usage` SSE event (or include a
`usage` block on the final chunk's `choices[].delta` / on `done`). Inspect
the live stream and pick the right hook point — typically:

```ts
// in the SSE for-await loop in sendMessage(...)
} else if (event.type === 'usage') {
  // OR: pull from chunk.usage on the final chunk
  notifyUsageSubscribers(sessionId, event.data);
}
```

Some servers also send usage as headers on the response body (not SSE
events). If that's the case here, capture them in the `client.ts`
streaming method and forward them via the same path.

### 3b. Expose a tiny pub-sub on the store

Add a module-level `Set<ChatUsageCallback>` in `src/stores/chat.ts`:

```ts
type ChatUsageCallback = (sessionId: string, rawUsage: unknown) => void;
const usageSubscribers = new Set<ChatUsageCallback>();

function notifyUsageSubscribers(sessionId: string, raw: unknown) {
  for (const cb of usageSubscribers) {
    try { cb(sessionId, raw); } catch (err) { console.warn(err); }
  }
}
```

Add `subscribeToUsage` to the `ChatState` interface and the store object:

```ts
interface ChatState {
  // ...existing fields...
  subscribeToUsage: (cb: ChatUsageCallback) => () => void;
}

// inside create<ChatState>() :
subscribeToUsage: (cb) => {
  usageSubscribers.add(cb);
  return () => usageSubscribers.delete(cb);
},
```

That's it. `useStreamUsageBridge` will pick it up automatically — no
changes needed in `src/features/usage/`.

### 3c. Optional: `clearMessages(sid)` should also call `clearUsage(sid)`

Today `useChatStore.clearMessages(sid)` resets the slice but leaves the
usage entry behind. If desired, add a tiny call to keep the two stores in
sync — but importing the usage store inside the chat store would create
the very cross-feature coupling we're avoiding. Better to do it at the
call-site (e.g. in the `/clear` handler) or via the bridge.

## 4. Slash command `/usage` — wire to open the modal

`src/features/slash/commands.ts` already declares `/usage` (id `usage`,
category `info`, kind `local`) and `dispatch.ts` renders a placeholder
markdown block. To open the modal instead, the dispatcher's caller (the
chat surface that consumes `DispatchResult`) should special-case the
command id and open the modal:

```tsx
// wherever `dispatchSlashCommand` is consumed, e.g. in InputBox/ChatView:
import { useState } from 'react';
import { UsageModal } from '@/features/usage/UsageModal';

const [usageModalSession, setUsageModalSession] = useState<string | null>(null);

// after parseInvocation succeeds:
if (parsed.command.id === 'usage') {
  setUsageModalSession(sessionId);
  return; // skip dispatching to the markdown renderer
}

// at the bottom of the JSX:
{usageModalSession && (
  <UsageModal
    sessionId={usageModalSession}
    onClose={() => setUsageModalSession(null)}
  />
)}
```

Alternatively, the existing markdown placeholder in `dispatch.ts`'s
`renderUsage()` can stay as-is for now — clicking the chip already opens
the modal, so `/usage` is a nice-to-have rather than a requirement.

## 5. What happens before integration step 3 lands

- Chip renders **"No usage"** in muted zinc-600.
- Modal still works (clicking the chip opens it) but shows "No data yet."
- The `/usage` slash command renders the existing markdown placeholder
  from `dispatch.ts` — nothing breaks.
- Cumulative totals persist across reloads (zustand `persist` with key
  `hermes-usage`), so once events start flowing the store fills up
  immediately.

## Lucide icons used

`Activity`, `DollarSign`, `Zap`, `X`.

## Persistence

- Store key: `hermes-usage` (separate from `hermes-chat`).
- Only `usageBySession` is persisted. Action functions are recreated on
  rehydrate.
- Defensive `merge` validates each entry's shape; malformed persisted
  state is replaced with the default.

## Caveats

- **No new IPC channels.** The bridge reads from the chat store via a
  documented public API — no `window.hermesAPI` extension needed.
- **Cost is server-supplied.** We never compute cost on the client. If
  the server omits it, the chip shows token count only and the modal
  shows "—".
- **Rate-limit fields are best-effort.** Most providers emit them as
  HTTP headers; capturing those will need `client.ts` work (see 3a).
- **Bridge is mount-once.** Calling `useStreamUsageBridge()` in more than
  one place will register multiple subscriptions — harmless but wasteful.
