/**
 * AuditScreen — browse + filter the locally-recorded audit log of every
 * approval / clarify / sudo / secret request the agent has surfaced and
 * how the user responded.
 *
 * Layout:
 *   - Top bar:
 *       - filter pills (All / Approval / Clarify / Sudo / Secret)
 *       - search box (filters by request_id, session_id, decision, payload text)
 *       - refresh button (calls `useAudit().refresh()`)
 *       - clear button (disabled — see useAudit.ts TODO)
 *   - Body:
 *       - paginated list of entries (page size 50; "Load more" appends)
 *       - each row: relative time + abs hover, kind badge, decision pill,
 *         session_id link (dispatches `hermes:open-session`), mono request_id,
 *         expandable payload (AuditEntryDetail)
 *       - empty state: "No requests recorded yet."
 *
 * The screen is purely presentational over `useAudit()`. All filtering and
 * pagination is client-side — the audit table is small (cap 500 rows) and
 * the list-IPC roundtrip is fast.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { AuditEntryDetail } from './AuditEntryDetail';
import { useAudit } from './useAudit';
import type { AuditKindFilter, ParsedAuditRow } from './types';

const PAGE_SIZE = 50;

const FILTERS: Array<{ id: AuditKindFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'approval', label: 'Approval' },
  { id: 'clarify', label: 'Clarify' },
  { id: 'sudo', label: 'Sudo' },
  { id: 'secret', label: 'Secret' },
];

// ─── Formatting helpers ───
function formatAbsolute(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  return `${d.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function formatRelative(ms: number, now = Date.now()): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const diffMs = now - ms;
  if (diffMs < 0) return 'just now';
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

// ─── Visual tokens per kind ───
interface KindTone {
  badge: string;
  dot: string;
  label: string;
}

function kindTone(kind: string): KindTone {
  switch (kind.toLowerCase()) {
    case 'approval':
      return {
        badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
        dot: 'bg-amber-500',
        label: 'Approval',
      };
    case 'clarify':
      return {
        badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
        dot: 'bg-blue-500',
        label: 'Clarify',
      };
    case 'sudo':
      return {
        badge: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
        dot: 'bg-rose-500',
        label: 'Sudo',
      };
    case 'secret':
      return {
        badge: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
        dot: 'bg-violet-500',
        label: 'Secret',
      };
    default:
      return {
        badge: 'bg-zinc-800 text-zinc-300 border-zinc-700',
        dot: 'bg-zinc-500',
        label: kind || 'unknown',
      };
  }
}

// ─── Decision tone ───
function decisionTone(decision: string | null): {
  className: string;
  label: string;
} | null {
  if (!decision) return null;
  const lower = decision.toLowerCase();
  if (lower === 'approved' || lower === 'approve') {
    return {
      className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      label: 'approved',
    };
  }
  if (lower === 'denied' || lower === 'deny' || lower === 'rejected') {
    return {
      className: 'bg-red-500/10 text-red-300 border-red-500/30',
      label: 'denied',
    };
  }
  if (lower === 'cancelled' || lower === 'canceled' || lower === 'cancel') {
    return {
      className: 'bg-zinc-700/50 text-zinc-400 border-zinc-600',
      label: 'cancelled',
    };
  }
  if (lower === 'answered' || lower === 'answer' || lower === 'submitted') {
    return {
      className: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
      label: lower,
    };
  }
  // Free-form answer (clarify response). Truncate so the pill stays single-line.
  const truncated = decision.length > 40 ? `${decision.slice(0, 37)}…` : decision;
  return {
    className: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    label: truncated,
  };
}

// ─── Search index helper ───
function entryHaystack(e: ParsedAuditRow): string {
  return [
    e.kind,
    e.decision ?? '',
    e.request_id ?? '',
    e.session_id ?? '',
    e.payloadRaw ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function dispatchOpen(sessionId: string): void {
  window.dispatchEvent(
    new CustomEvent('hermes:open-session', { detail: { sessionId } }),
  );
}

// ─── Row ───
function AuditRowItem({
  entry,
  expanded,
  onToggle,
}: {
  entry: ParsedAuditRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tone = kindTone(entry.kind);
  const decision = decisionTone(entry.decision);
  const absolute = formatAbsolute(entry.created_at);
  const relative = formatRelative(entry.created_at);

  const handleSessionClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (entry.session_id) dispatchOpen(entry.session_id);
    },
    [entry.session_id],
  );

  return (
    <div className="border border-zinc-800 rounded-xl bg-zinc-900/40 overflow-hidden">
      {/* Header (clickable to expand) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-zinc-900 transition-colors"
        aria-expanded={expanded}
      >
        <span className="mt-0.5 text-zinc-500 shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <div className="min-w-0 flex-1">
          {/* Top line: kind + decision + relative time */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${tone.badge}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
              {tone.label}
            </span>
            {decision && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${decision.className}`}
                title={entry.decision ?? undefined}
              >
                {decision.label}
              </span>
            )}
            {entry.payloadError && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border bg-red-500/10 text-red-300 border-red-500/30"
                title={entry.payloadError}
              >
                <AlertTriangle size={10} />
                payload error
              </span>
            )}
            <span
              className="ml-auto text-[10px] text-zinc-500 shrink-0"
              title={absolute}
            >
              {relative}
            </span>
          </div>

          {/* Bottom line: ids */}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-zinc-500">
            {entry.session_id ? (
              <span
                role="link"
                tabIndex={0}
                onClick={handleSessionClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (entry.session_id) dispatchOpen(entry.session_id);
                  }
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800/80 text-amber-300 hover:text-amber-200 hover:bg-zinc-800 cursor-pointer transition-colors"
                title={`Open session ${entry.session_id} in the focused chat pane`}
              >
                <ExternalLink size={10} />
                <span className="font-mono">{entry.session_id}</span>
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-600">
                no session
              </span>
            )}
            {entry.request_id && (
              <span
                className="font-mono text-zinc-600 truncate max-w-[220px]"
                title={entry.request_id}
              >
                req: {entry.request_id}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Detail */}
      {expanded && <AuditEntryDetail entry={entry} />}
    </div>
  );
}

// ─── Skeleton ───
function SkeletonRow() {
  return (
    <div className="px-3 py-3 border border-zinc-800 rounded-xl bg-zinc-900/40 animate-pulse">
      <div className="h-3 w-1/2 bg-zinc-800 rounded mb-2" />
      <div className="h-2 w-1/3 bg-zinc-800/70 rounded" />
    </div>
  );
}

// ─── Main screen ───
export function AuditScreen() {
  const { entries, loading, error, refresh, available } = useAudit();
  const [filter, setFilter] = useState<AuditKindFilter>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pageCount, setPageCount] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== 'all' && e.kind.toLowerCase() !== filter) return false;
      if (q && !entryHaystack(e).includes(q)) return false;
      return true;
    });
  }, [entries, filter, query]);

  const visibleCount = Math.min(filtered.length, pageCount * PAGE_SIZE);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Tally per kind for the pill counters.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      const k = e.kind.toLowerCase();
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [entries]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    setPageCount(1);
    void refresh();
  }, [refresh]);

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {/* Top bar */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3 space-y-2">
        {/* Title row */}
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-amber-500 shrink-0" />
          <h1 className="text-sm font-semibold text-zinc-200">Audit Log</h1>
          <span className="text-[11px] text-zinc-500">
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} · last
            500
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Re-read the audit log from the local SQLite cache"
          >
            <RefreshCw
              size={11}
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed transition-colors"
            title="Clearing the audit log is not yet implemented (no IPC handler — see useAudit.ts TODO)"
          >
            <Trash2 size={11} />
            Clear
          </button>
        </div>

        {/* Filter + search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const tone = f.id === 'all' ? null : kindTone(f.id);
              const count = counts[f.id] ?? 0;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFilter(f.id);
                    setPageCount(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-lg border transition-colors ${
                    active
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  {tone && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${tone.dot}`}
                    />
                  )}
                  {f.label}
                  <span className="text-[10px] text-zinc-600">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[180px] px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-lg focus-within:border-amber-500/50 transition-colors">
            <Search size={12} className="text-zinc-500 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPageCount(1);
              }}
              placeholder="Filter by request id, session id, decision, payload…"
              className="flex-1 min-w-0 bg-transparent outline-none text-xs text-zinc-200 placeholder:text-zinc-600"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setPageCount(1);
                }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded hover:bg-zinc-800"
              >
                clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="mx-4 mt-3 px-3 py-2 text-xs text-red-300 bg-red-900/20 border border-red-800/60 rounded-lg flex items-start gap-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="px-4 py-4 space-y-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : !available ? (
          <EmptyState
            title="Audit bridge unavailable"
            body="window.hermesAPI.audit is not available in this build. Run via the Electron host."
          />
        ) : entries.length === 0 ? (
          <EmptyState
            title="No requests recorded yet."
            body="Approval, clarify, sudo, and secret responses will be logged here once the chat store starts forwarding decisions to the audit table. See INTEGRATION.md."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matches"
            body="No audit entries match the current filter or search."
          />
        ) : (
          <div className="px-4 py-3 space-y-1.5">
            {visible.map((entry) => (
              <AuditRowItem
                key={entry.id}
                entry={entry}
                expanded={expanded.has(entry.id)}
                onToggle={() => toggleExpand(entry.id)}
              />
            ))}
            {hasMore && (
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setPageCount((n) => n + 1)}
                  className="px-3 py-1.5 text-[11px] rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  Load more ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}
            {!hasMore && filtered.length > PAGE_SIZE && (
              <div className="pt-2 text-center text-[10px] text-zinc-600">
                showing all {filtered.length} entries
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ───
function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="h-full flex items-center justify-center px-6 py-10">
      <div className="text-center space-y-2 max-w-sm">
        <ShieldCheck size={32} className="mx-auto text-zinc-700" />
        <p className="text-sm text-zinc-400">{title}</p>
        <p className="text-xs text-zinc-500">{body}</p>
      </div>
    </div>
  );
}
