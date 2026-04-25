/**
 * useSoulEditor — single-document editor backed by the SOUL.md API surface.
 *
 * Models the editor state explicitly so the screen can render the dirty dot,
 * the conflict modal, and the action buttons from a single source of truth.
 *
 * Hash-based optimistic concurrency, modelled after dodo's
 * `FileEditorService` (Sources/HermesDesktop/Services/FileEditorService.swift):
 *
 *   1. `load()` calls `client.getSoul()`, computes sha256 of the returned
 *      content, and snapshots that as `originalHash`. Sets both `content` and
 *      `originalContent` so `isDirty` reads false.
 *
 *   2. `save()` re-fetches the server's current content via `client.getSoul()`,
 *      hashes it, and compares to `originalHash`. Mismatch ⇒ throws
 *      `ConflictError` carrying the latest server content for "Reload from
 *      server" without an extra round-trip. On match, calls
 *      `client.patchSoul({ content })` and snapshots the new content's hash.
 *
 *   3. `forceSave()` skips the re-fetch and always writes — used by the
 *      conflict modal's "Force overwrite" button.
 *
 * The hook deliberately exposes both `originalHash` (for the header chip) and
 * `originalContent` (for `reset()` and conflict UX), matching the spec's
 * `{ content, originalContent, contentHash, … }` surface.
 *
 * The spec calls the write method `client.updateSoul`, but the existing
 * client surface (which Phase 0 shipped and which we're forbidden to edit)
 * exposes `client.patchSoul` instead. We use what's actually available.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnectionStore } from '@/stores/connection';
import type { SoulResponse } from '@/api/types';
import { sha256 } from './sha256';

/**
 * Thrown by `save()` when the server's current SOUL.md hash differs from the
 * hash we recorded at load-time. The renderer shows a `ConflictModal` and
 * lets the user choose between reloading and force-overwriting.
 */
export class ConflictError extends Error {
  readonly expectedHash: string;
  readonly actualHash: string;
  readonly latestContent: string;

  constructor(opts: { expectedHash: string; actualHash: string; latestContent: string }) {
    super(
      `SOUL.md changed on the server (expected ${opts.expectedHash.slice(0, 8)}…, got ${opts.actualHash.slice(0, 8)}…).`
    );
    this.name = 'ConflictError';
    this.expectedHash = opts.expectedHash;
    this.actualHash = opts.actualHash;
    this.latestContent = opts.latestContent;
  }
}

export interface UseSoulEditorResult {
  /** Current editor buffer. */
  content: string;
  /** Mutator for the editor buffer (e.g. textarea onChange). */
  setContent: (next: string) => void;
  /** Snapshot of the server's content at load time. Used for `isDirty`. */
  originalContent: string;
  /** sha256 of `originalContent`. Drives the header hash chip. */
  contentHash: string;
  /** True while `load()` is in flight. */
  loading: boolean;
  /** True while `save()` (or `forceSave()`) is in flight. */
  saving: boolean;
  /** Last error string from any operation. Cleared on the next op. */
  error: string | null;
  /** `content !== originalContent`. */
  isDirty: boolean;
  /** Epoch ms of the last successful load. Drives the header timestamp. */
  lastLoaded: number | null;
  /** Server-reported `last_modified` from the most recent load. */
  lastModified: string | null;
  /** Re-fetch from the server; discards local edits. */
  load: () => Promise<void>;
  /** Hash-checked save. Throws `ConflictError` on drift. */
  save: () => Promise<void>;
  /** Skip the hash check and always write — backs "Force overwrite". */
  forceSave: () => Promise<void>;
  /** Restore `content` to the last loaded value. */
  reset: () => void;
}

export function useSoulEditor(): UseSoulEditorResult {
  const getClient = useConnectionStore((s) => s.getClient);

  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [contentHash, setContentHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);
  const [lastModified, setLastModified] = useState<string | null>(null);

  // Mirror the hash in a ref so async `save()` reads the freshest snapshot
  // without forcing a re-render-driven dependency in `useCallback`. This
  // matches dodo's `FileEditorService`, where the expected hash is captured
  // at load-time and travels with the write request.
  const originalHashRef = useRef('');

  const applyLoaded = useCallback((res: SoulResponse, hash: string) => {
    const next = res.content || '';
    setContent(next);
    setOriginalContent(next);
    setContentHash(hash);
    setLastLoaded(Date.now());
    setLastModified(res.last_modified ?? null);
    originalHashRef.current = hash;
  }, []);

  const load = useCallback(async () => {
    const client = getClient();
    if (!client) {
      setError('Not connected to a Hermes server.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await client.getSoul();
      const hash = await sha256(res.content || '');
      applyLoaded(res, hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SOUL.md');
    } finally {
      setLoading(false);
    }
  }, [getClient, applyLoaded]);

  /**
   * Internal write helper: optionally verifies the on-server hash, then
   * patches with the current `content` and refreshes the cached hash.
   */
  const performSave = useCallback(
    async (verify: boolean): Promise<void> => {
      const client = getClient();
      if (!client) {
        setError('Not connected to a Hermes server.');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        if (verify) {
          const latest = await client.getSoul();
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

        const res = await client.patchSoul({ content });
        const persistedContent = res.content ?? content;
        const newHash = await sha256(persistedContent);
        // Adopt the server's canonical text so we don't drift if it normalised
        // line endings or trailing whitespace.
        setOriginalContent(persistedContent);
        setContent(persistedContent);
        setContentHash(newHash);
        setLastModified(res.last_modified ?? null);
        setLastLoaded(Date.now());
        originalHashRef.current = newHash;
      } catch (err) {
        if (err instanceof ConflictError) {
          // Don't pollute `error` with a conflict — the modal handles it.
          throw err;
        }
        setError(err instanceof Error ? err.message : 'Failed to save SOUL.md');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [getClient, content]
  );

  const save = useCallback(() => performSave(true), [performSave]);
  const forceSave = useCallback(() => performSave(false), [performSave]);

  const reset = useCallback(() => {
    setContent(originalContent);
  }, [originalContent]);

  // Initial load whenever the active client changes.
  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = content !== originalContent;

  return useMemo<UseSoulEditorResult>(
    () => ({
      content,
      setContent,
      originalContent,
      contentHash,
      loading,
      saving,
      error,
      isDirty,
      lastLoaded,
      lastModified,
      load,
      save,
      forceSave,
      reset,
    }),
    [
      content,
      originalContent,
      contentHash,
      loading,
      saving,
      error,
      isDirty,
      lastLoaded,
      lastModified,
      load,
      save,
      forceSave,
      reset,
    ]
  );
}
