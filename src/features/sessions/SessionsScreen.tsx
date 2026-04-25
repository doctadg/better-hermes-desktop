/**
 * Hermes Desktop — Sessions feature: full-text search browser.
 *
 * Top bar:
 *   - search input (FTS5-backed)
 *   - "Sync from server" pulls fresh sessions + history into the local cache
 *   - profile filter pill (read-only — reflects the active connection profile)
 *
 * Body modes:
 *   - empty query → date-grouped session list with sticky headers
 *   - query       → snippet-highlighted message hits, each card shows the
 *                    parent session title, role badge, and timestamp
 *
 * Click on any card / row dispatches a `hermes:open-session` CustomEvent.
 * App.tsx will listen for it and route the id into the focused pane via
 * `useLayoutStore.assignToFocused`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  History,
  MessageSquare,
  RefreshCw,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { useConnectionStore } from '@/stores/connection';
import { groupByDate, type GroupedSessions } from './dateGrouping';
import { SnippetHighlight } from './SnippetHighlight';
import {
  useSessions,
  type CachedSessionRow,
  type MessageSearchHit,
} from './useSessions';

const SEARCH_DEBOUNCE_MS = 250;

const GROUP_ORDER: Array<{ key: keyof GroupedSessions<CachedSessionRow>; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'thisWeek', label: 'This Week' },
  { key: 'earlier', label: 'Earlier' },
];

// ─── Small formatting helpers ───
function formatTime(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(
    [],
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

// FTS hit timestamps are stored as seconds (consistent with API messages).
function formatHitTime(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const d = new Date(seconds * 1000);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(
    [],
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

function dispatchOpen(sessionId: string): void {
  window.dispatchEvent(new CustomEvent('hermes:open-session', { detail: { sessionId } }));
}

// ─── Role badge ───
function RoleBadge({ role }: { role: string }) {
  const lower = role.toLowerCase();
  const Icon = lower === 'user' ? User : lower === 'assistant' ? Bot : MessageSquare;
  const tone =
    lower === 'user'
      ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
      : lower === 'assistant'
        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
        : 'bg-zinc-900 text-zinc-500 border-zinc-800';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${tone}`}
    >
      <Icon size={10} />
      {role}
    </span>
  );
}

// ─── Loading skeleton ───
function SkeletonRow() {
  return (
    <div className="px-3 py-3 border border-zinc-800 rounded-xl bg-zinc-900/40 animate-pulse">
      <div className="h-3 w-1/2 bg-zinc-800 rounded mb-2" />
      <div className="h-2 w-1/3 bg-zinc-800/70 rounded" />
    </div>
  );
}

// ─── Session card (date-grouped mode) ───
function SessionCard({
  session,
  showFullDate,
  deleting,
  onOpen,
  onDelete,
}: {
  session: CachedSessionRow;
  showFullDate: boolean;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const dateLabel = showFullDate
    ? formatFullDate(session.started_at)
    : formatTime(session.started_at);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex items-start gap-3 px-3 py-2.5 border border-zinc-800 rounded-xl bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 transition-colors duration-150 cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm text-zinc-200 truncate">
            {session.title?.trim() || 'Untitled session'}
          </span>
          {dateLabel && (
            <span className="text-[10px] text-zinc-500 shrink-0">{dateLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {session.source && (
            <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400">
              {session.source}
            </span>
          )}
          <span>
            {session.message_count} msg{session.message_count === 1 ? '' : 's'}
          </span>
          {session.model && (
            <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 truncate max-w-[160px]">
              {session.model}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={deleting}
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-50"
        title="Delete cached session"
        aria-label="Delete cached session"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─── Search hit card ───
function SearchHitCard({ hit, onOpen }: { hit: MessageSearchHit; onOpen: () => void }) {
  const title = hit.session_title?.trim() || `Session ${hit.session_id.slice(-6)}`;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex flex-col gap-1.5 px-3 py-2.5 border border-zinc-800 rounded-xl bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 transition-colors duration-150 cursor-pointer"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-zinc-200 truncate flex-1">{title}</span>
        <RoleBadge role={hit.role} />
        <span className="text-[10px] text-zinc-500 shrink-0">
          {formatHitTime(hit.timestamp)}
        </span>
      </div>
      <div className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
        <SnippetHighlight snippet={hit.snippet} />
      </div>
    </div>
  );
}

// ─── Main screen ───
export function SessionsScreen() {
  const activeProfile = useConnectionStore((s) => s.activeProfile);
  const hasClient = useConnectionStore((s) => !!s.client);

  const {
    sessions,
    loading,
    search,
    results,
    searching,
    searchError,
    syncFromServer,
    syncing,
    syncError,
    deleting,
    remove,
  } = useSessions();

  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const grouped = useMemo(() => groupByDate(sessions), [sessions]);
  const isSearching = query.trim().length > 0;

  const handleOpen = useCallback((id: string) => {
    dispatchOpen(id);
  }, []);

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {/* Top bar */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3 flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl focus-within:border-amber-500/50 transition-colors">
          <Search size={14} className="text-zinc-500 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-zinc-200 placeholder:text-zinc-600"
            spellCheck={false}
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded hover:bg-zinc-800"
            >
              clear
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => void syncFromServer()}
          disabled={syncing || !hasClient}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={hasClient ? 'Pull latest sessions from the server' : 'Connect to a server first'}
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync from server'}
        </button>

        <span
          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full border ${
            activeProfile
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              : 'bg-zinc-900 text-zinc-500 border-zinc-800'
          }`}
          title={
            activeProfile
              ? `Filtered by profile: ${activeProfile}`
              : 'No profile filter — showing all cached sessions'
          }
        >
          <History size={11} />
          {activeProfile ?? 'all profiles'}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {(syncError || searchError) && (
          <div className="mx-4 mt-3 px-3 py-2 text-xs text-red-300 bg-red-900/20 border border-red-800/60 rounded-lg">
            {searchError ?? syncError}
          </div>
        )}

        {isSearching ? (
          <SearchPane
            results={results}
            searching={searching}
            query={query.trim()}
            onOpen={handleOpen}
          />
        ) : (
          <BrowsePane
            grouped={grouped}
            loading={loading}
            deleting={deleting}
            onOpen={handleOpen}
            onDelete={(id) => void remove(id)}
            onSync={() => void syncFromServer()}
            canSync={hasClient}
            syncing={syncing}
          />
        )}
      </div>
    </div>
  );
}

// ─── Browse pane (date-grouped) ───
function BrowsePane({
  grouped,
  loading,
  deleting,
  onOpen,
  onDelete,
  onSync,
  canSync,
  syncing,
}: {
  grouped: GroupedSessions<CachedSessionRow>;
  loading: boolean;
  deleting: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onSync: () => void;
  canSync: boolean;
  syncing: boolean;
}) {
  if (loading) {
    return (
      <div className="px-4 py-4 space-y-2">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  const totalCount =
    grouped.today.length +
    grouped.yesterday.length +
    grouped.thisWeek.length +
    grouped.earlier.length;

  if (totalCount === 0) {
    return (
      <div className="h-full flex items-center justify-center px-6 py-10">
        <div className="text-center space-y-3 max-w-sm">
          <History size={32} className="mx-auto text-zinc-700" />
          <p className="text-sm text-zinc-400">No cached sessions yet</p>
          <p className="text-xs text-zinc-500">
            {canSync
              ? 'Pull conversations from the server to populate this list.'
              : 'Connect to a server to import your sessions.'}
          </p>
          {canSync && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              Sync from server
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      {GROUP_ORDER.map(({ key, label }) => {
        const items = grouped[key];
        if (items.length === 0) return null;
        const showFullDate = key === 'thisWeek' || key === 'earlier';
        return (
          <section key={key} className="mb-4">
            <div className="sticky top-0 z-10 -mx-4 px-4 py-1.5 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/60">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  {label}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {items.length}
                </span>
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              {items.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  showFullDate={showFullDate}
                  deleting={deleting === s.id}
                  onOpen={() => onOpen(s.id)}
                  onDelete={() => onDelete(s.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Search pane ───
function SearchPane({
  results,
  searching,
  query,
  onOpen,
}: {
  results: MessageSearchHit[];
  searching: boolean;
  query: string;
  onOpen: (id: string) => void;
}) {
  if (searching && results.length === 0) {
    return (
      <div className="px-4 py-4 space-y-2">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-6 py-10">
        <div className="text-center space-y-2 max-w-sm">
          <Search size={28} className="mx-auto text-zinc-700" />
          <p className="text-sm text-zinc-400">No matches for "{query}"</p>
          <p className="text-xs text-zinc-500">
            Try a different phrase, or sync from the server to broaden the index.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-1.5">
      {results.map((hit, i) => (
        <SearchHitCard
          key={`${hit.session_id}:${hit.timestamp}:${i}`}
          hit={hit}
          onOpen={() => onOpen(hit.session_id)}
        />
      ))}
    </div>
  );
}
