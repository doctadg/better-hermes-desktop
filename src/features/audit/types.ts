/**
 * Audit feature types.
 *
 * The raw row shape is defined in `electron/preload.ts` and re-exported here
 * so the feature is self-contained — every consumer in `src/features/audit/*`
 * imports from this module rather than the preload.
 *
 * `ParsedAuditRow` decorates the raw row with a `payload` field that is
 * deserialized once at the hook boundary (see `useAudit.ts`). Parsing is
 * intentionally tolerant: bad or empty JSON degrades to `null` plus a
 * `payloadError` string so the UI can surface it without crashing.
 */
import type { AuditRow } from '@electron/preload';

export type { AuditRow };

/** Canonical audit kinds we render with dedicated colour / labels. */
export type AuditKind = 'approval' | 'clarify' | 'sudo' | 'secret';

/** Filter pill values for the AuditScreen top bar. */
export type AuditKindFilter = 'all' | AuditKind;

/**
 * A row decoded from `AuditRow`:
 *   - `payload` is `unknown` (not `any`) — caller should narrow before use
 *   - `payloadError` carries any JSON parse error message, otherwise null
 *   - `kindLabel` is the display label (Title-cased)
 */
export interface ParsedAuditRow {
  id: string;
  kind: string;
  request_id: string | null;
  session_id: string | null;
  decision: string | null;
  created_at: number;
  /** Decoded payload (any JSON value), or `null` if the column was empty / invalid. */
  payload: unknown;
  /** Original payload JSON string (kept for copy-to-clipboard fidelity). */
  payloadRaw: string | null;
  /** If parsing failed, the error message; otherwise `null`. */
  payloadError: string | null;
}

/**
 * Safely decode a raw `payload` JSON column.
 * Returns `{ value, error }` so callers can surface parse failures.
 */
export function parsePayload(raw: string | null | undefined): {
  value: unknown;
  error: string | null;
} {
  if (raw == null || raw === '') return { value: null, error: null };
  try {
    return { value: JSON.parse(raw) as unknown, error: null };
  } catch (err) {
    return {
      value: null,
      error: err instanceof Error ? err.message : 'Invalid JSON payload',
    };
  }
}

/** Decorate a raw `AuditRow` with a parsed payload. Pure / total. */
export function parseAuditRow(row: AuditRow): ParsedAuditRow {
  const { value, error } = parsePayload(row.payload);
  return {
    id: row.id,
    kind: row.kind,
    request_id: row.request_id,
    session_id: row.session_id,
    decision: row.decision,
    created_at: row.created_at,
    payload: value,
    payloadRaw: row.payload,
    payloadError: error,
  };
}
