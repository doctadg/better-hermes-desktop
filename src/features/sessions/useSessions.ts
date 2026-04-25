/**
 * Hermes Desktop — Sessions feature: data hook.
 *
 * Wraps the SQLite-backed session/message cache shipped in Phase 0 (exposed
 * as `window.hermesAPI.sessions.*` / `window.hermesAPI.messages.*` by the
 * preload bridge) with a small ergonomic API for the SessionsScreen:
 *
 *   - `sessions`       latest local cache, profile-filtered
 *   - `loading`        true while the initial cache load is in flight
 *   - `refresh()`      re-read the local cache (no network)
 *   - `search(q)`      run an FTS5 search via `messages.search`
 *   - `results`        last search hits
 *   - `syncFromServer` pull `client.listSessions()` + each session's history
 *                      into the local cache (skipping unchanged ones)
 *   - `syncing`        true during a syncFromServer pass
 *   - `deleting`       id currently being removed (or null)
 *   - `remove(id)`     drop one cached session and refresh
 *
 * All `window.hermesAPI` calls are typed locally because `src/api/types.ts`
 * (intentionally not modified by this feature) doesn't yet describe the new
 * Phase 0 namespaces.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '@/stores/connection';

// ─── Local typing for the Phase-0 hermesAPI namespaces ───
//
// Mirrors `electron/preload.ts`. Kept in this file so the feature is a closed
// unit and we don't need to touch `src/api/types.ts`.

export interface CachedSessionRow {
  id: string;
  profile: string | null;
  source: string | null;
  started_at: number | null;
  ended_at: number | null;
  message_count: number;
  model: string | null;
  title: string | null;
  updated_at: number;
}

export interface CachedMessageRow {
  id: string;
  role: string;
  content: string;
  timestamp: number;
}

export interface MessageSearchHit {
  session_id: string;
  role: string;
  timestamp: number;
  snippet: string;
  session_title: string | null;
  session_started_at: number | null;
}

interface SessionsBridge {
  upsert: (s: Partial<CachedSessionRow> & { id: string }) => Promise<void>;
  list: (opts?: { profile?: string | null; limit?: number; offset?: number }) => Promise<CachedSessionRow[]>;
  remove: (id: string) => Promise<void>;
  messages: (sessionId: string) => Promise<CachedMessageRow[]>;
}

interface MessagesBridge {
  insert: (m: { id: string; session_id: string; role: string; content: string; timestamp: number }) => Promise<void>;
  search: (query: string, opts?: { limit?: number; profile?: string | null }) => Promise<MessageSearchHit[]>;
}

interface HermesPhase0Surface {
  sessions: SessionsBridge;
  messages: MessagesBridge;
}

function getBridge(): HermesPhase0Surface | null {
  const api = (window as unknown as { hermesAPI?: Partial<HermesPhase0Surface> }).hermesAPI;
  if (!api || !api.sessions || !api.messages) return null;
  return api as HermesPhase0Surface;
}

// ─── Hook state shape ───
export interface UseSessionsResult {
  sessions: CachedSessionRow[];
  loading: boolean;
  refresh: () => Promise<void>;
  search: (q: string) => Promise<void>;
  results: MessageSearchHit[];
  searching: boolean;
  searchError: string | null;
  syncFromServer: () => Promise<void>;
  syncing: boolean;
  syncError: string | null;
  deleting: string | null;
  remove: (id: string) => Promise<void>;
}

const SESSION_PAGE_SIZE = 200;
const SEARCH_LIMIT = 50;

export function useSessions(): UseSessionsResult {
  const activeProfile = useConnectionStore((s) => s.activeProfile);
  const client = useConnectionStore((s) => s.client);

  const [sessions, setSessions] = useState<CachedSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<MessageSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const searchSeq = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const bridge = getBridge();
    if (!bridge) {
      setSessions([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await bridge.sessions.list({
        profile: activeProfile,
        limit: SESSION_PAGE_SIZE,
      });
      setSessions(rows);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [activeProfile]);

  // Initial load + reload on profile change.
  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const search = useCallback(
    async (q: string): Promise<void> => {
      const bridge = getBridge();
      const trimmed = q.trim();
      if (!bridge || !trimmed) {
        setResults([]);
        setSearching(false);
        setSearchError(null);
        return;
      }
      const seq = ++searchSeq.current;
      setSearching(true);
      setSearchError(null);
      try {
        const hits = await bridge.messages.search(trimmed, {
          limit: SEARCH_LIMIT,
          profile: activeProfile,
        });
        if (seq !== searchSeq.current) return;
        setResults(hits);
      } catch (err) {
        if (seq !== searchSeq.current) return;
        setResults([]);
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (seq === searchSeq.current) {
          setSearching(false);
        }
      }
    },
    [activeProfile],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const bridge = getBridge();
      if (!bridge) return;
      setDeleting(id);
      try {
        await bridge.sessions.remove(id);
        await refresh();
      } finally {
        setDeleting(null);
      }
    },
    [refresh],
  );

  const syncFromServer = useCallback(async (): Promise<void> => {
    const bridge = getBridge();
    if (!bridge) {
      setSyncError('Local cache is unavailable');
      return;
    }
    if (!client) {
      setSyncError('No active connection');
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await client.listSessions();
      const remote = res.sessions ?? [];

      // Build a lookup of locally-cached message counts so we can skip
      // sessions whose history hasn't grown since the last sync.
      const local = await bridge.sessions.list({
        profile: activeProfile,
        limit: 10_000,
      });
      const localCountById = new Map<string, number>();
      for (const row of local) {
        localCountById.set(row.id, row.message_count ?? 0);
      }

      for (const session of remote) {
        const remoteCount = session.message_count ?? 0;
        const previousCount = localCountById.get(session.id);

        // Always upsert metadata (title/model/etc may have shifted).
        await bridge.sessions.upsert({
          id: session.id,
          profile: activeProfile,
          source: session.source ?? null,
          started_at: session.started_at ?? null,
          ended_at: null,
          message_count: remoteCount,
          model: session.model ?? null,
          title: session.title ?? null,
        });

        // Only re-pull the message body when the count changed.
        if (previousCount !== undefined && previousCount === remoteCount) {
          continue;
        }

        try {
          const history = await client.getSessionHistory(session.id);
          const messages = history.messages ?? [];
          for (let i = 0; i < messages.length; i += 1) {
            const m = messages[i];
            const ts =
              typeof m.timestamp === 'number' && Number.isFinite(m.timestamp)
                ? m.timestamp
                : Date.now() / 1000;
            await bridge.messages.insert({
              id: `${session.id}:${i}`,
              session_id: session.id,
              role: m.role,
              content: m.content ?? '',
              timestamp: ts,
            });
          }
        } catch {
          // Per-session history fetch is best-effort — keep going.
        }
      }

      await refresh();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [client, activeProfile, refresh]);

  return {
    sessions,
    loading,
    refresh,
    search,
    results,
    searching,
    searchError,
    syncFromServer,
    syncing,
    syncError,
    deleting,
    remove,
  };
}
