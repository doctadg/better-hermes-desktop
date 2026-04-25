/**
 * Hermes Desktop — Usage store
 *
 * Zustand store keyed by `sessionId`. Persisted to localStorage under the
 * key `hermes-usage` so cumulative totals survive reloads.
 *
 * Public API:
 *   - `recordUsage(sid, usage)` — set `current` to the given snapshot and
 *     ADD it onto `cumulative`. Idempotent only if you stop calling it; we
 *     don't deduplicate, so the bridge MUST send only deltas (i.e. the usage
 *     for one completed run, not a running cumulative total).
 *   - `clearUsage(sid)` — remove the entry entirely (used when a session
 *     is deleted or the user runs `/clear`).
 *   - `clearAll()` — wipe everything.
 *
 * Selectors live at the bottom of the file as small React hooks.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  EMPTY_SESSION_USAGE,
  EMPTY_TOKEN_USAGE,
  addTokenUsage,
  type SessionUsage,
  type TokenUsage,
} from './types';

interface UsageState {
  /** Per-session usage entries, keyed by session id. */
  usageBySession: Record<string, SessionUsage>;

  /**
   * Record an observed usage delta for `sessionId`. The provided `usage` is
   * treated as the "current" run — it replaces the previous `current` and
   * is ADDED onto `cumulative`.
   */
  recordUsage: (sessionId: string, usage: TokenUsage) => void;

  /** Drop the entry for `sessionId`. No-op if it doesn't exist. */
  clearUsage: (sessionId: string) => void;

  /** Wipe everything — used by "clear all data" flows. */
  clearAll: () => void;
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set) => ({
      usageBySession: {},

      recordUsage: (sessionId, usage) => {
        if (!sessionId) return;
        set((state) => {
          const prev = state.usageBySession[sessionId] ?? EMPTY_SESSION_USAGE;
          const cumulative = addTokenUsage(prev.cumulative, usage);
          const next: SessionUsage = {
            current: usage,
            cumulative,
            updatedAt: Date.now(),
          };
          return {
            usageBySession: {
              ...state.usageBySession,
              [sessionId]: next,
            },
          };
        });
      },

      clearUsage: (sessionId) => {
        if (!sessionId) return;
        set((state) => {
          if (!state.usageBySession[sessionId]) return state;
          const next = { ...state.usageBySession };
          delete next[sessionId];
          return { usageBySession: next };
        });
      },

      clearAll: () => set({ usageBySession: {} }),
    }),
    {
      name: 'hermes-usage',
      // Only persist the session map; everything else is the action surface.
      partialize: (state) => ({ usageBySession: state.usageBySession }),
      // Defensive merge: if persisted shape is malformed, fall back to empty.
      merge: (persisted, current) => {
        const ps = persisted as { usageBySession?: unknown } | null;
        if (!ps || typeof ps.usageBySession !== 'object' || ps.usageBySession === null) {
          return current;
        }
        const restored: Record<string, SessionUsage> = {};
        for (const [sid, raw] of Object.entries(
          ps.usageBySession as Record<string, unknown>
        )) {
          if (!raw || typeof raw !== 'object') continue;
          const r = raw as Partial<SessionUsage>;
          restored[sid] = {
            current: r.current ?? EMPTY_TOKEN_USAGE,
            cumulative: r.cumulative ?? EMPTY_TOKEN_USAGE,
            updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
          };
        }
        return { ...current, usageBySession: restored };
      },
    }
  )
);

// ─── Selector hooks (stable references for components) ────────────────────

const EMPTY_USAGE_REF: SessionUsage = EMPTY_SESSION_USAGE;

/** Returns the `SessionUsage` for `sessionId`, or a stable empty value. */
export function useSessionUsage(
  sessionId: string | null | undefined
): SessionUsage {
  return useUsageStore(
    (s) =>
      (sessionId ? s.usageBySession[sessionId] : undefined) ?? EMPTY_USAGE_REF
  );
}

/** Returns `true` if any usage data has been recorded for the session. */
export function useHasUsage(sessionId: string | null | undefined): boolean {
  return useUsageStore((s) => {
    if (!sessionId) return false;
    const u = s.usageBySession[sessionId];
    return Boolean(u && u.cumulative.totalTokens > 0);
  });
}

/** Snapshot getter — for non-React code (e.g. the bridge hook's effects). */
export function getUsageSnapshot(): Record<string, SessionUsage> {
  return useUsageStore.getState().usageBySession;
}
