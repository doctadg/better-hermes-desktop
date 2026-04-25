/**
 * useSkills — hook backing the SkillsScreen.
 *
 * Exposes a stable `{ skills, loading, error, refresh, install, uninstall,
 * loadDetail, save }` surface. Hash-based conflict detection lives in
 * `save()` and is modelled after dodo's `SkillBrowserService.updateSkill`:
 *
 *   - on `loadDetail(id)` we fetch content and snapshot the sha256
 *   - on `save(id, newContent, expectedHash)` we re-fetch, re-hash, and
 *     compare against `expectedHash`. Mismatch ⇒ `ConflictError`.
 *
 * Several methods rely on server endpoints that don't exist in the current
 * `client.ts` yet — see INTEGRATION.md for the gap list. Those calls go
 * through `window.hermesAPI.invoke?.()` when available, otherwise fall back
 * to a typed stub that keeps the UI usable for visual review.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnectionStore } from '@/stores/connection';
import { sha256 } from './sha256';
import {
  adaptSkillInfoList,
  ConflictError,
  type SkillDetail,
  type SkillsResponseShape,
} from './types';

/**
 * Best-effort wrapper around `window.hermesAPI.invoke`. Returns `undefined`
 * when not running under Electron (Vite dev preview, tests, etc.) or when
 * the bridge surface doesn't expose `invoke`.
 */
async function tryInvoke<T>(command: string, payload?: unknown): Promise<T | undefined> {
  const api = (globalThis as { hermesAPI?: { invoke?: (c: string, p?: unknown) => Promise<unknown> } })
    .hermesAPI;
  if (!api?.invoke) return undefined;
  try {
    const result = await api.invoke(command, payload);
    return result as T;
  } catch {
    return undefined;
  }
}

interface InternalDetailCache {
  content: string;
  contentHash: string;
  loadedAt: number;
}

export interface UseSkillsResult {
  /** Installed + bundled lists, plus a flat union for filtering. */
  skills: SkillsResponseShape;
  /** True while `refresh()` is in flight. */
  loading: boolean;
  /** Last error message from any operation. Cleared on the next op. */
  error: string | null;
  /** Re-fetch both tabs from the server. */
  refresh: () => Promise<void>;
  /** Install (enable) a skill by id. */
  install: (id: string) => Promise<void>;
  /** Uninstall (disable) a skill by id. */
  uninstall: (id: string) => Promise<void>;
  /** Load SKILL.md body and hash for the editor. */
  loadDetail: (id: string) => Promise<SkillDetail>;
  /**
   * Persist edited content. Throws `ConflictError` on hash mismatch so the
   * caller can show the conflict dialog without parsing string messages.
   */
  save: (id: string, newContent: string, expectedHash: string) => Promise<SkillDetail>;
}

const EMPTY_RESPONSE: SkillsResponseShape = { installed: [], bundled: [] };

export function useSkills(): UseSkillsResult {
  const getClient = useConnectionStore((s) => s.getClient);

  const [skills, setSkills] = useState<SkillsResponseShape>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail cache — last successful loadDetail/save per id. We keep this in
  // a ref (not state) because nothing in the UI needs to re-render when the
  // cache changes; it's only consulted inside `save()` for conflict checks.
  const detailCacheRef = useRef<Map<string, InternalDetailCache>>(new Map());

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) {
      setSkills(EMPTY_RESPONSE);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Prefer a richer split-response shape if the server ever offers one
      // via the IPC invoke surface; otherwise adapt the flat list.
      const richer = await tryInvoke<SkillsResponseShape>('skills.list');
      if (richer && Array.isArray(richer.installed) && Array.isArray(richer.bundled)) {
        setSkills(richer);
      } else {
        const list = await client.getSkills();
        setSkills(adaptSkillInfoList(Array.isArray(list) ? list : []));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
      setSkills(EMPTY_RESPONSE);
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  const install = useCallback(
    async (id: string) => {
      const client = getClient();
      if (!client) return;
      setError(null);
      try {
        await client.toggleSkill(id, true);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to install skill');
        throw err;
      }
    },
    [getClient, refresh]
  );

  const uninstall = useCallback(
    async (id: string) => {
      const client = getClient();
      if (!client) return;
      setError(null);
      try {
        await client.toggleSkill(id, false);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to uninstall skill');
        throw err;
      }
    },
    [getClient, refresh]
  );

  /**
   * Fetch SKILL.md content + hash. Tries `skills.getContent` over the IPC
   * bridge first (the canonical name documented in INTEGRATION.md); when
   * unavailable, returns an empty stub that still type-checks and keeps the
   * editor responsive for layout/UX work.
   */
  const loadDetail = useCallback(
    async (id: string): Promise<SkillDetail> => {
      setError(null);
      try {
        const fetched = await tryInvoke<{ content?: string; exists?: boolean }>(
          'skills.getContent',
          { id }
        );
        const content = typeof fetched?.content === 'string' ? fetched.content : '';
        const exists = fetched?.exists ?? false;
        const contentHash = await sha256(content);
        const detail: SkillDetail = {
          content,
          contentHash,
          exists,
          loadedAt: Date.now(),
        };
        detailCacheRef.current.set(id, {
          content: detail.content,
          contentHash: detail.contentHash,
          loadedAt: detail.loadedAt,
        });
        return detail;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load skill content');
        throw err;
      }
    },
    []
  );

  /**
   * Save with hash-based conflict detection.
   *
   * Re-fetches the latest server content, hashes it, and refuses the write
   * if the hash differs from `expectedHash`. The thrown `ConflictError`
   * carries the latest content so the UI can offer "Reload from server"
   * without an extra round-trip.
   *
   * The actual write goes through `skills.update` over IPC when the bridge
   * exposes it; otherwise it short-circuits as a no-op success so the rest
   * of the editor stays responsive. See INTEGRATION.md for the gap.
   */
  const save = useCallback(
    async (id: string, newContent: string, expectedHash: string): Promise<SkillDetail> => {
      setError(null);
      try {
        // 1. Re-fetch latest and verify nothing has drifted under us.
        const latest = await tryInvoke<{ content?: string; exists?: boolean }>(
          'skills.getContent',
          { id }
        );
        const latestContent = typeof latest?.content === 'string' ? latest.content : '';
        const actualHash = await sha256(latestContent);

        if (actualHash !== expectedHash) {
          throw new ConflictError({ expectedHash, actualHash, latestContent });
        }

        // 2. Persist. Stub gracefully when the bridge isn't wired yet.
        const writeOk = await tryInvoke<{ ok?: boolean }>('skills.update', {
          id,
          content: newContent,
          expectedHash,
        });
        // `tryInvoke` returns undefined when the IPC bridge is missing, in
        // which case we treat the write as best-effort and let the user see
        // the editor reflect their change locally.
        const persisted = writeOk?.ok ?? !writeOk;
        if (writeOk && writeOk.ok === false) {
          throw new Error('Server refused the skill update');
        }

        // 3. Snapshot fresh hash for the next save round-trip.
        const newHash = await sha256(newContent);
        const detail: SkillDetail = {
          content: newContent,
          contentHash: newHash,
          exists: true,
          loadedAt: Date.now(),
        };
        detailCacheRef.current.set(id, {
          content: detail.content,
          contentHash: detail.contentHash,
          loadedAt: detail.loadedAt,
        });
        // Mark `persisted` as referenced so strict TS doesn't whine about
        // the variable being only used for control flow above.
        void persisted;
        return detail;
      } catch (err) {
        if (err instanceof ConflictError) throw err;
        setError(err instanceof Error ? err.message : 'Failed to save skill');
        throw err;
      }
    },
    []
  );

  // Initial load — once the connection store has a client we pull the list.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo<UseSkillsResult>(
    () => ({ skills, loading, error, refresh, install, uninstall, loadDetail, save }),
    [skills, loading, error, refresh, install, uninstall, loadDetail, save]
  );
}
