# Compare feature — integration notes (Phase 3Q)

**Model A/B compare** — synchronized dual-pane chat where the same
prompt is sent to two different models simultaneously, with side-by-side
comparison of output, latency, and token usage. Beyond-parity feature:
neither competing client ships this.

This feature is fully self-contained under `src/features/compare/`. It
relies on existing surfaces only — the layout store (Phase 0), the chat
store, the model library bridge (Phase 0), and the usage store. No new
IPC, no new preload methods, no new dependencies.

## Files

| File | Purpose |
| ---- | ------- |
| `types.ts` | `CompareConfig` (left/right `ModelRow` + per-side `sessionId`) and `CompareMetric` (`latencyMs`, `promptTokens`, `completionTokens`, `costUsd`, `completedAt`). |
| `useCompareSession.ts` | Hook that owns the pair: `start(left, right)`, `sendBoth(text)`, `stopBoth()`, `reset()`. Subscribes to the chat store + usage store and exposes live `metrics` and `isStreaming` per side. |
| `ModelPicker.tsx` | Searchable, provider-grouped dropdown over the saved model library. Reused twice in `CompareScreen`. |
| `CompareMetrics.tsx` | Bottom strip with two side cards. Renders model name, latency, tokens (prompt / completion), and cost — each updated live. |
| `CompareScreen.tsx` | Entry screen. Two visual states: pre-start setup card (two pickers + Start/Reset) and post-start active header (model pills + shared input + Stop/Reset, with the metrics strip pinned). |

## Wiring into the shell

Add a sidebar/nav entry that mounts `CompareScreen`:

```tsx
import { CompareScreen } from '@/features/compare/CompareScreen';

const navEntry = { id: 'compare', label: 'A/B Compare', icon: 'Columns2' };

// in the route/screen switch:
case 'compare':
  return <CompareScreen />;
```

- `id`: `'compare'`
- `label`: `'A/B Compare'`
- `icon`: `'Columns2'` (from `lucide-react`)
- No hotkey is registered.

## How it works at runtime

1. The user opens the **A/B Compare** screen and picks a model in each
   `ModelPicker` (sourced from `window.hermesAPI.models.list()` via the
   shared `useModels()` hook from Phase 1).
2. Pressing **Start compare** calls `useCompareSession.start(left, right)`:
   - Generates two new session ids via `generateSessionId()` (the same
     helper exported from `src/stores/chat.ts`).
   - Calls `useChatStore.ensureSession` on each id.
   - Calls `useLayoutStore.setLayout('2x1')` to switch to dual-pane.
   - Binds pane[0] -> left session, pane[1] -> right session via
     `useLayoutStore.setPaneSession('pane_0', sidLeft)` / `'pane_1'`.
   - Focuses `pane_0`.
3. The chat output for each side is rendered by the existing dual-pane
   layout — the screen does not duplicate `ChatView`. The compare screen
   itself stays mounted (in its own nav slot) and contributes the
   shared input, the Stop/Reset controls, and the live metrics chip.
4. Pressing **Send to both** calls
   `useChatStore.sendMessage(sidLeft, text)` and the same for `sidRight`
   in parallel via `Promise.all`.
5. The hook subscribes to `useChatStore` and `useUsageStore`:
   - **Latency**: captured as the timestamp of the first non-empty
     `streamingContent` after a send fired, minus the send timestamp.
   - **Tokens / cost**: pulled from `useUsageStore.usageBySession[sid]
     .current` whenever it changes.
   - **`completedAt`**: timestamp when `isStreaming` flipped from true
     to false after a send.
6. `Stop both` calls `useChatStore.interruptStream(sid)` for each side.
7. `Reset` clears the local `CompareConfig` and the picker state but
   leaves the bound sessions and the 2×1 layout intact (so existing
   chat history is preserved if the user wants to keep them open).

## Chat-store gap (DOCUMENTED — required for a follow-up patch)

`useChatStore.sendMessage` currently has the signature:

```ts
sendMessage: (sessionId: string, text: string) => Promise<void>;
```

The Phase 3Q spec calls for a **per-message model override** so we can
do `sendMessage(sidLeft, text, { model: leftModel.model })` and have
each side definitively use the right model on a given send. This isn't
possible today.

**The change needed (out of scope for this feature — central commit
must land it):** add an optional second-arg options object to
`sendMessage`:

```ts
// src/stores/chat.ts (proposed)
sendMessage: (
  sessionId: string,
  text: string,
  opts?: { model?: string },
) => Promise<void>;
```

…and thread `opts.model` into the `client.chatCompletionsStream`
request, e.g. by adding a `model` field to the request payload (the
underlying OpenAI-style API already accepts it). The bridge layer in
`src/api/client.ts` would need a matching signature change. The
existing Phase 3Q usage-store wiring already keys per-session, so usage
deltas continue to land correctly.

**Until that change lands**, A/B compare is still functional via this
contract:

- The shell's existing per-pane model picker (the chat client already
  renders one when a session is bound to a pane — cf. Phase 1
  `INTEGRATION.md` "Chat-pane model picker") lets the user select a
  different model for pane[0] vs pane[1] before pressing **Send to
  both**.
- `useCompareSession.sendBoth` then hits each session, and each
  session's existing model context is used. The side-by-side
  comparison, the latency chip, and the token chip all still work
  because they're keyed by `sessionId`, not by a per-call model param.

This is documented as a known gap so the central committer can
coordinate the chat-store + client.ts patch and then drop the optional
`{ model }` argument in `useCompareSession.sendBoth` (the call site is
already structured for it — see the comment at the top of that file).

## What this feature does NOT touch

- `src/App.tsx` — caller wires the route.
- `src/stores/*` — uses public methods only (no new state or actions).
- `src/api/*` — no new HTTP/WS methods.
- `src/components/*` — no shared component changes; the compare screen
  is a leaf that mounts only its own components.
- `electron/*` — relies on the existing `models.*` and DB surface.
- `package.json` — no new dependencies (uses only `lucide-react`,
  already a dep).

## Constraints honored

- Only files under `src/features/compare/` were created.
- Strict TS, passes `npx tsc -p tsconfig.json --noEmit`.
- Tailwind-only (`bg-zinc-950` / `bg-zinc-900` shells, `border-zinc-800`,
  `text-zinc-100`, accent `text-amber-500`).
- Inputs use `px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl
  focus:border-amber-500 outline-none`.
- Icons sourced exclusively from `lucide-react`: `Columns2`, `Play`,
  `RotateCcw`, `Zap`, `Clock`, `Hash` (plus `ChevronDown`, `Search`, `X`
  used by the picker, all already present elsewhere in the app).
