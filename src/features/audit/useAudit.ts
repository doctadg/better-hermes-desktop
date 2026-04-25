/**
 * Audit feature — data hook.
 *
 * Wraps `window.hermesAPI.audit.list({ limit: 500 })` and parses each row's
 * `payload` JSON column into a typed `ParsedAuditRow`.
 *
 * Returns:
 *   - `entries`  most recent first (preload already orders by `created_at DESC`)
 *   - `loading`  true during the initial load
 *   - `error`    string | null — surfaced from the IPC call
 *   - `refresh`  re-runs the query (the screen calls this from its refresh button)
 *   - `clear`    PLACEHOLDER — the preload does not yet ship a "wipe audit"
 *                IPC call. Documented as TODO; the screen renders the button
 *                disabled with an explanatory tooltip. Calling it returns a
 *                rejected promise so misuse fails loudly.
 *
 * The preload `audit.list` API is already typed in `src/api/types.ts` (the
 * declaration of `Window.hermesAPI`), so we don't need a local cast.
 */
import { useCallback, useEffect, useState } from 'react';
import { parseAuditRow, type ParsedAuditRow } from './types';

const AUDIT_LIMIT = 500;

export interface UseAuditResult {
  entries: ParsedAuditRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clear: () => Promise<void>;
  /** True if the underlying preload audit bridge is available. */
  available: boolean;
}

export function useAudit(): UseAuditResult {
  const [entries, setEntries] = useState<ParsedAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean>(true);

  const refresh = useCallback(async (): Promise<void> => {
    const api = window.hermesAPI;
    if (!api || !api.audit || typeof api.audit.list !== 'function') {
      setAvailable(false);
      setEntries([]);
      setLoading(false);
      setError('Audit log is unavailable in this build (no IPC bridge).');
      return;
    }
    setAvailable(true);
    setLoading(true);
    setError(null);
    try {
      const rows = await api.audit.list({ limit: AUDIT_LIMIT });
      setEntries(rows.map(parseAuditRow));
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // TODO(phase-3R): no `audit.clear` IPC handler exists yet (preload only
  // ships `append` + `list`). Wiring it requires a new handler in
  // `electron/ipc-handlers.ts` plus a preload bridge entry. Until that lands,
  // the screen surfaces this as a disabled button with a tooltip; calling it
  // programmatically returns a rejected promise to fail loudly.
  const clear = useCallback(async (): Promise<void> => {
    return Promise.reject(
      new Error('audit.clear is not yet wired (TODO: add IPC handler in electron/ipc-handlers.ts).'),
    );
  }, []);

  return { entries, loading, error, refresh, clear, available };
}
