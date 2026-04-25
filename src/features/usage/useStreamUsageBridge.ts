/**
 * Hermes Desktop — Stream → Usage bridge
 *
 * Mounts ONCE near the top of the app (e.g. in `App.tsx`) and forwards
 * "usage" SSE events from the chat store into the usage store.
 *
 * Why a separate bridge instead of writing into the usage store from
 * `chat.ts`? Two reasons:
 *
 *   1. The chat store is shared infrastructure — adding a usage-feature
 *      dependency there couples the two domains. By owning the wiring
 *      here we keep the usage feature self-contained and removable.
 *
 *   2. The chat store doesn't currently emit usage events at all (see
 *      `src/stores/chat.ts` — the SSE loop only handles `chunk`,
 *      `tool_progress`, and `done`). The bridge is built defensively so
 *      it works either way:
 *
 *        - If the chat store later exposes `subscribeToUsage`, the bridge
 *          subscribes and forwards every event to `recordUsage`.
 *        - If not, the bridge is a harmless no-op.
 *
 * The required chat-store change is documented in `INTEGRATION.md`.
 *
 * Usage:
 *   ```tsx
 *   // src/App.tsx — once, top level
 *   import { useStreamUsageBridge } from '@/features/usage/useStreamUsageBridge';
 *   function App() {
 *     useStreamUsageBridge();
 *     // … rest of App
 *   }
 *   ```
 */

import { useEffect } from 'react';
import { useChatStore } from '@/stores/chat';
import { useUsageStore } from './usageStore';
import { normalizeTokenUsage, type TokenUsage } from './types';

/**
 * Shape we expect the chat store to expose IF/WHEN it forwards usage
 * events. Keeping this declared locally so we don't need to touch the
 * shared chat-store types.
 */
type ChatUsageCallback = (
  sessionId: string,
  rawUsage: unknown
) => void;

interface ChatUsageSubscriber {
  /** Subscribe; returns an unsubscribe function. */
  subscribeToUsage?: (callback: ChatUsageCallback) => () => void;
}

/**
 * Mount once near the top of the app.
 *
 * Returns nothing; the effect handles its own teardown.
 */
export function useStreamUsageBridge(): void {
  useEffect(() => {
    // Pull a reference to the chat store's API. We deliberately don't use a
    // store hook here so we don't re-render on every chat-store update —
    // we only need imperative access to set up a subscription.
    const chatApi = useChatStore.getState() as unknown as ChatUsageSubscriber;
    const recordUsage = useUsageStore.getState().recordUsage;

    if (typeof chatApi.subscribeToUsage !== 'function') {
      // Chat store doesn't expose usage events yet — nothing to do.
      // (See INTEGRATION.md for what to add to `src/stores/chat.ts`.)
      if (typeof console !== 'undefined') {
        console.debug(
          '[usage] chat store does not expose subscribeToUsage — no-op bridge'
        );
      }
      return;
    }

    const unsubscribe = chatApi.subscribeToUsage((sessionId, rawUsage) => {
      if (!sessionId) return;
      const usage: TokenUsage | null = normalizeTokenUsage(rawUsage);
      if (!usage) return;
      recordUsage(sessionId, usage);
    });

    return () => {
      try {
        unsubscribe();
      } catch (err) {
        // Defensive: never throw from cleanup.
        if (typeof console !== 'undefined') {
          console.warn('[usage] bridge unsubscribe failed', err);
        }
      }
    };
  }, []);
}

/**
 * Imperative variant — useful if the bridge needs to be wired up from a
 * non-React context (e.g. inside electron preload glue, or a test harness).
 *
 * Returns the unsubscribe function. Defensive: returns a no-op if the
 * chat store doesn't expose the hook.
 */
export function attachStreamUsageBridge(): () => void {
  const chatApi = useChatStore.getState() as unknown as ChatUsageSubscriber;
  const recordUsage = useUsageStore.getState().recordUsage;

  if (typeof chatApi.subscribeToUsage !== 'function') {
    return () => {
      /* no-op */
    };
  }

  const unsubscribe = chatApi.subscribeToUsage((sessionId, rawUsage) => {
    if (!sessionId) return;
    const usage = normalizeTokenUsage(rawUsage);
    if (!usage) return;
    recordUsage(sessionId, usage);
  });

  return unsubscribe;
}
