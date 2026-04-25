/**
 * AuditEntryDetail — expanded row content for a `ParsedAuditRow`.
 *
 * Renders:
 *   - the full pretty-printed JSON payload (or an error block on parse fail)
 *   - a "Copy JSON" button (uses `navigator.clipboard` with a graceful
 *     fallback to a hidden textarea)
 *   - a "Jump to session" button that dispatches `hermes:open-session`
 *     (already wired in `App.tsx`); rendered only when `session_id` exists
 *
 * Stateless aside from the transient "Copied" pulse — the parent owns
 * expansion state.
 */
import { useCallback, useState } from 'react';
import { AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import type { ParsedAuditRow } from './types';

interface AuditEntryDetailProps {
  entry: ParsedAuditRow;
}

function dispatchOpen(sessionId: string): void {
  window.dispatchEvent(
    new CustomEvent('hermes:open-session', { detail: { sessionId } }),
  );
}

/**
 * Pretty-print a payload for display.
 * Prefers the parsed value (clean JSON.stringify), falls back to the raw
 * column on parse error so the user still sees what was stored.
 */
function formatPayload(entry: ParsedAuditRow): string {
  if (entry.payloadError) {
    return entry.payloadRaw ?? '';
  }
  if (entry.payload === null && entry.payloadRaw === null) {
    return '(no payload)';
  }
  try {
    return JSON.stringify(entry.payload, null, 2);
  } catch {
    return entry.payloadRaw ?? '';
  }
}

/**
 * Copy a string to the clipboard with a textarea fallback for older
 * surfaces (Electron renderers without a focused HTTPS context, etc).
 * Returns `true` on success.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}

export function AuditEntryDetail({ entry }: AuditEntryDetailProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(formatPayload(entry));
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [entry]);

  const handleJump = useCallback(() => {
    if (entry.session_id) dispatchOpen(entry.session_id);
  }, [entry.session_id]);

  const formatted = formatPayload(entry);

  return (
    <div className="px-3 pb-3 pt-1 space-y-2">
      {/* Action row */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
          title="Copy JSON payload to clipboard"
        >
          <Copy size={11} />
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
        {entry.session_id && (
          <button
            type="button"
            onClick={handleJump}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors"
            title={`Open session ${entry.session_id} in the focused chat pane`}
          >
            <ExternalLink size={11} />
            Jump to session
          </button>
        )}
      </div>

      {/* Parse error banner (if any) */}
      {entry.payloadError && (
        <div className="flex items-start gap-2 px-2.5 py-1.5 text-[11px] rounded-lg bg-red-900/20 border border-red-800/60 text-red-300">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">Payload JSON could not be parsed</div>
            <div className="text-red-400/80 break-words">{entry.payloadError}</div>
          </div>
        </div>
      )}

      {/* Pretty-printed payload */}
      <pre className="max-h-80 overflow-auto px-3 py-2 text-[11px] leading-relaxed font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 whitespace-pre-wrap break-words">
        {formatted}
      </pre>
    </div>
  );
}
