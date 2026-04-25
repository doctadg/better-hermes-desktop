/**
 * useMemoryConflict — hash-based optimistic-concurrency wrapper for a single
 * text resource.
 *
 * Generic factory hook that takes a `load`/`save` pair (so it can wrap either
 * MEMORY.md or USER.md, or anything else with a `{ content }` shape) and adds
 * the dodo-reach pattern from `useSoulEditor.ts`:
 *
 *   1. `load()` fetches `{ content }`, hashes it, and snapshots that as
 *      `originalHash` (and as `originalContent`, so callers can compare for
 *      `isDirty` or implement a Reset button).
 *
 *   2. `save()` re-fetches via `load`, hashes the latest content, compares to
 *      `originalHash`, and:
 *        - mismatch → throws `ConflictError` carrying the latest content so
 *          the UI can offer "Reload from server" without an extra round-trip.
 *        - match    → calls `save(content)` and re-snapshots the hash.
 *
 *   3. `forceSave()` skips the verification — used by the conflict modal's
 *      "Force overwrite" action.
 *
 *   4. `reset()` rolls the editor buffer back to `originalContent`.
 *
 * The hook owns the editor buffer (`content` + `setContent`) and the loading /
 * saving / error flags. Callers wire it to a textarea and a Save button; the
 * thrown `ConflictError` is the signal to render the `ConflictModal`.
 *
 * Note: this is a *single-file* concurrency primitive. The Entries tab serializes
 * many per-entry edits into one MEMORY.md write, so it wraps the whole-file
 * blob — concurrency is checked at the file level, not the entry level.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sha256 } from './sha256';

/**
 * Thrown by `save()` when the on-disk hash differs from the hash captured at
 * load-time. The renderer shows a `ConflictModal` and lets the user choose
 * between reloading and force-overwriting.
 */
export class ConflictError extends Error {
  readonly expectedHash: string;
  readonly actualHash: string;
  readonly latestContent: string;

  constructor(opts: { expectedHash: string; actualHash: string; latestContent: string }) {
    super(
      `Resource changed on the server (expected ${opts.expectedHash.slice(0, 8)}…, got ${opts.actualHash.slice(0, 8)}…).`,
    );
    this.name = 'ConflictError';
    this.expectedHash = opts.expectedHash;
    this.actualHash = opts.actualHash;
    this.latestContent = opts.latestContent;
  }
}

export interface UseMemoryConflictOptions {
  /** Fetches the current resource. Called on initial load and on every save's pre-check. */
  load: () => Promise<{ content: string }>;
  /** Persists the edited content. Should resolve once the server has accepted the write. */
  save: (content: string) => Promise<void>;
}

export interface UseMemoryConflictResult {
  /** Current editor buffer. */
  content: string;
  /** Mutator for the editor buffer (textarea onChange). */
  setContent: (next: string) => void;
  /** Snapshot of the server's content at load-time (or last successful save). */
  originalContent: string;
  /** sha256 of `originalContent`. Available for header chips / debugging. */
  contentHash: string;
  /** `content !== originalContent`. */
  isDirty: boolean;
  /** True while the initial / explicit `load()` is in flight. */
  loading: boolean;
  /** True while `save()` (or `forceSave()`) is in flight. */
  saving: boolean;
  /** Last error message from any operation. Cleared on the next op. */
  error: string | null;
  /** Re-fetch from the server; resets the buffer to the server's value. */
  load: () => Promise<void>;
  /** Hash-checked save. Throws `ConflictError` on drift. */
  save: () => Promise<void>;
  /** Restore `content` to `originalContent`. */
  reset: () => void;
  /** Skip the hash check and always write — backs "Force overwrite". */
  forceSave: () => Promise<void>;
}

export function useMemoryConflict(opts: UseMemoryConflictOptions): UseMemoryConflictResult {
  const { load: loadFn, save: saveFn } = opts;

  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [contentHash, setContentHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror the hash in a ref so async `save()` reads the freshest snapshot
  // without re-creating callbacks on every render. Matches the soul editor.
  const originalHashRef = useRef('');

  const applyLoaded = useCallback((next: string, hash: string) => {
    setContent(next);
    setOriginalContent(next);
    setContentHash(hash);
    originalHashRef.current = hash;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadFn();
      const next = res.content || '';
      const hash = await sha256(next);
      applyLoaded(next, hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [loadFn, applyLoaded]);

  /**
   * Internal write helper: when `verify` is true, refetch + hash + compare
   * before writing; on mismatch throw `ConflictError`. After a successful
   * write, re-hash the buffer we just wrote so subsequent saves use the
   * fresh baseline.
   */
  const performSave = useCallback(
    async (verify: boolean): Promise<void> => {
      setSaving(true);
      setError(null);
      try {
        if (verify) {
          const latest = await loadFn();
          const latestContent = latest.content || '';
          const actualHash = await sha256(latestContent);
          if (actualHash !== originalHashRef.current) {
            throw new ConflictError({
              expectedHash: originalHashRef.current,
              actualHash,
              latestContent,
            });
          }
        }

        await saveFn(content);
        // Re-hash from our local buffer. The server response shape is opaque
        // here (the caller's `save` is `() => Promise<void>`), so we treat
        // `content` as the new baseline. If the server normalises whitespace,
        // the next `load()` will catch up.
        const newHash = await sha256(content);
        setOriginalContent(content);
        setContentHash(newHash);
        originalHashRef.current = newHash;
      } catch (err) {
        if (err instanceof ConflictError) {
          // Don't pollute `error` with a conflict — the modal handles it.
          throw err;
        }
        setError(err instanceof Error ? err.message : 'Failed to save');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [loadFn, saveFn, content],
  );

  const save = useCallback(() => performSave(true), [performSave]);
  const forceSave = useCallback(() => performSave(false), [performSave]);

  const reset = useCallback(() => {
    setContent(originalContent);
  }, [originalContent]);

  // Initial load whenever the loader identity changes (i.e. the active
  // client / endpoint binding rotates).
  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = content !== originalContent;

  return useMemo<UseMemoryConflictResult>(
    () => ({
      content,
      setContent,
      originalContent,
      contentHash,
      isDirty,
      loading,
      saving,
      error,
      load,
      save,
      reset,
      forceSave,
    }),
    [
      content,
      originalContent,
      contentHash,
      isDirty,
      loading,
      saving,
      error,
      load,
      save,
      reset,
      forceSave,
    ],
  );
}
