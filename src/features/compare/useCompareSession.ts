/**
 * Compare feature — session-pair manager.
 *
 * Wraps two chat-store sessions and the layout store to power the
 * synchronized A/B compare flow:
 *
 *   1. `start(left, right)` mints two new session ids, ensures slices
 *      exist in the chat store, switches the layout to '2x1', and binds
 *      pane[0] -> left, pane[1] -> right.
 *   2. `sendBoth(text)` fires `useChatStore.sendMessage` against both
 *      sessions in parallel. We capture per-side send timestamps so we
 *      can compute first-token latency from chat-store updates.
 *   3. The hook subscribes to chat-store + usage-store and surfaces a
 *      live `metrics` object (`{ left, right }`) the chip can render.
 *
 * Deliberate non-goals:
 *   - This hook does NOT modify the chat store or the layout store. It
 *     only reads/calls public methods.
 *   - It does NOT pass a per-message model override (`sendMessage` does
 *     not currently accept one — see INTEGRATION.md "Chat-store gap").
 *     Until that lands, the user is expected to switch the active model
 *     on each pane before pressing "Send to both" — the comparison
 *     remains valid because each session lives in its own pane.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore, generateSessionId, type SessionSlice } from '@/stores/chat';
import { useLayoutStore } from '@/stores/layout';
import { useUsageStore } from '@/features/usage/usageStore';
import type { ModelRow } from '@/features/models/types';
import {
  EMPTY_COMPARE_METRIC,
  type CompareConfig,
  type CompareMetric,
  type CompareSide,
} from './types';

export interface CompareSessionState {
  /** Active config, or `null` until `start` is called. */
  config: CompareConfig | null;
  /** Per-side metrics, kept fresh during streaming. */
  metrics: { left: CompareMetric; right: CompareMetric };
  /** Whether either side is currently streaming. */
  isStreaming: { left: boolean; right: boolean };
  /** Last error message from a sendBoth call, or `null`. */
  error: string | null;
}

export interface UseCompareSessionResult extends CompareSessionState {
  /** Bind two models and prep both sessions + layout. Returns the new config. */
  start: (left: ModelRow, right: ModelRow) => CompareConfig;
  /** Send the same prompt to both sides in parallel. No-op if no config. */
  sendBoth: (text: string) => Promise<void>;
  /** Interrupt both streams. */
  stopBoth: () => void;
  /** Tear down: clears config + per-side metric snapshots. Layout/sessions are left intact. */
  reset: () => void;
}

/**
 * Tracks per-side metric state outside React so the streaming-driven
 * effect doesn't churn on every chunk. We snapshot into React state
 * via `setMetrics` from the chat-store subscription.
 */
interface SendTracker {
  /** Epoch ms when sendBoth fired for this side. Reset every send. */
  sendStartedAt: number | null;
  /** Epoch ms of the first observed streaming-content character. */
  firstTokenAt: number | null;
  /** Epoch ms when streaming flipped false after a send started. */
  completedAt: number | null;
}

const EMPTY_TRACKER: SendTracker = {
  sendStartedAt: null,
  firstTokenAt: null,
  completedAt: null,
};

export function useCompareSession(): UseCompareSessionResult {
  const ensureSession = useChatStore((s) => s.ensureSession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const interruptStream = useChatStore((s) => s.interruptStream);
  const setLayout = useLayoutStore((s) => s.setLayout);
  const setPaneSession = useLayoutStore((s) => s.setPaneSession);
  const focusPane = useLayoutStore((s) => s.focusPane);

  const [config, setConfig] = useState<CompareConfig | null>(null);
  const [metrics, setMetrics] = useState<{ left: CompareMetric; right: CompareMetric }>({
    left: EMPTY_COMPARE_METRIC,
    right: EMPTY_COMPARE_METRIC,
  });
  const [isStreaming, setIsStreaming] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });
  const [error, setError] = useState<string | null>(null);

  // Per-side trackers live in refs so the chat-store subscription can
  // mutate them without forcing re-renders on every chunk.
  const trackers = useRef<Record<CompareSide, SendTracker>>({
    left: { ...EMPTY_TRACKER },
    right: { ...EMPTY_TRACKER },
  });

  const start = useCallback(
    (left: ModelRow, right: ModelRow): CompareConfig => {
      const sessionIdLeft = generateSessionId();
      const sessionIdRight = generateSessionId();

      ensureSession(sessionIdLeft);
      ensureSession(sessionIdRight);

      // Switch to dual-pane and bind. setLayout adjusts the panes array
      // first; we then push session ids onto pane[0] and pane[1] by id.
      setLayout('2x1');
      setPaneSession('pane_0', sessionIdLeft);
      setPaneSession('pane_1', sessionIdRight);
      focusPane('pane_0');

      const next: CompareConfig = {
        left,
        right,
        sessionIdLeft,
        sessionIdRight,
      };
      setConfig(next);
      setMetrics({ left: EMPTY_COMPARE_METRIC, right: EMPTY_COMPARE_METRIC });
      setIsStreaming({ left: false, right: false });
      setError(null);
      trackers.current = {
        left: { ...EMPTY_TRACKER },
        right: { ...EMPTY_TRACKER },
      };
      return next;
    },
    [ensureSession, setLayout, setPaneSession, focusPane],
  );

  const sendBoth = useCallback(
    async (text: string) => {
      const cfg = config;
      if (!cfg) {
        setError('No active compare configuration. Call start() first.');
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) return;

      const now = Date.now();
      trackers.current.left = { sendStartedAt: now, firstTokenAt: null, completedAt: null };
      trackers.current.right = { sendStartedAt: now, firstTokenAt: null, completedAt: null };
      setMetrics({ left: EMPTY_COMPARE_METRIC, right: EMPTY_COMPARE_METRIC });
      setError(null);

      try {
        await Promise.all([
          sendMessage(cfg.sessionIdLeft, text),
          sendMessage(cfg.sessionIdRight, text),
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Compare send failed');
      }
    },
    [config, sendMessage],
  );

  const stopBoth = useCallback(() => {
    if (!config) return;
    interruptStream(config.sessionIdLeft);
    interruptStream(config.sessionIdRight);
  }, [config, interruptStream]);

  const reset = useCallback(() => {
    setConfig(null);
    setMetrics({ left: EMPTY_COMPARE_METRIC, right: EMPTY_COMPARE_METRIC });
    setIsStreaming({ left: false, right: false });
    setError(null);
    trackers.current = {
      left: { ...EMPTY_TRACKER },
      right: { ...EMPTY_TRACKER },
    };
  }, []);

  // ─── Live metric subscription ────────────────────────────────────
  // Watches each side's streaming state + content + usage-store entry
  // and updates `metrics` whenever any of them changes meaningfully.
  useEffect(() => {
    if (!config) return;
    const sides: Array<[CompareSide, string]> = [
      ['left', config.sessionIdLeft],
      ['right', config.sessionIdRight],
    ];

    function pickSlice(state: { sessions: Record<string, SessionSlice> }, sid: string): SessionSlice | undefined {
      return state.sessions[sid];
    }

    const unsubChat = useChatStore.subscribe((state) => {
      let changedStreaming = false;
      const nextStreaming = { ...isStreamingRef.current };
      const nextMetrics = { ...metricsRef.current };

      for (const [side, sid] of sides) {
        const slice = pickSlice(state, sid);
        const tracker = trackers.current[side];
        const wasStreaming = isStreamingRef.current[side];
        const nowStreaming = Boolean(slice?.isStreaming);

        if (wasStreaming !== nowStreaming) {
          nextStreaming[side] = nowStreaming;
          changedStreaming = true;
        }

        // First-token latency: as soon as we see streamingContent grow
        // for the first time after a sendStartedAt, capture it.
        if (
          tracker.sendStartedAt != null &&
          tracker.firstTokenAt == null &&
          (slice?.streamingContent?.length ?? 0) > 0
        ) {
          tracker.firstTokenAt = Date.now();
          nextMetrics[side] = {
            ...nextMetrics[side],
            latencyMs: tracker.firstTokenAt - tracker.sendStartedAt,
          };
          changedStreaming = true;
        }

        // Completion: streaming flipped from true -> false after a send.
        if (
          tracker.sendStartedAt != null &&
          wasStreaming &&
          !nowStreaming &&
          tracker.completedAt == null
        ) {
          tracker.completedAt = Date.now();
          nextMetrics[side] = {
            ...nextMetrics[side],
            completedAt: tracker.completedAt,
          };
          changedStreaming = true;
        }
      }

      if (changedStreaming) {
        isStreamingRef.current = nextStreaming;
        setIsStreaming(nextStreaming);
        metricsRef.current = nextMetrics;
        setMetrics(nextMetrics);
      }
    });

    const unsubUsage = useUsageStore.subscribe((state) => {
      const nextMetrics = { ...metricsRef.current };
      let changed = false;
      for (const [side, sid] of sides) {
        const u = state.usageBySession[sid];
        if (!u) continue;
        const cur = u.current;
        const prev = nextMetrics[side];
        if (
          prev.promptTokens !== cur.promptTokens ||
          prev.completionTokens !== cur.completionTokens ||
          prev.costUsd !== cur.costUsd
        ) {
          nextMetrics[side] = {
            ...prev,
            promptTokens: cur.promptTokens,
            completionTokens: cur.completionTokens,
            ...(cur.costUsd != null ? { costUsd: cur.costUsd } : {}),
          };
          changed = true;
        }
      }
      if (changed) {
        metricsRef.current = nextMetrics;
        setMetrics(nextMetrics);
      }
    });

    return () => {
      unsubChat();
      unsubUsage();
    };
  }, [config]);

  // Refs that mirror the latest state for use inside the subscriptions
  // (zustand subscribers run outside React, so we can't read state).
  const isStreamingRef = useRef(isStreaming);
  const metricsRef = useRef(metrics);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);
  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  return {
    config,
    metrics,
    isStreaming,
    error,
    start,
    sendBoth,
    stopBoth,
    reset,
  };
}
