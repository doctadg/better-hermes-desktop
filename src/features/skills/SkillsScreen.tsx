/**
 * SkillsScreen — split-pane skills browser/installer/editor.
 *
 * Layout (mirrors fathah's UX, evolved into a left/right split so the
 * editor stays visible while browsing):
 *
 *   ┌─────────────┬────────────────────────────┐
 *   │ search      │ name · version · source    │
 *   │ pills       │ [Install] [Uninstall][Save]│
 *   │ tabs        ├────────────────────────────┤
 *   │             │                            │
 *   │ skill list  │ <textarea SKILL.md>        │
 *   │             │                            │
 *   │             ├────────────────────────────┤
 *   │             │ Last loaded · hash · 🔄    │
 *   └─────────────┴────────────────────────────┘
 *
 * Hash-based conflict detection is delegated to `useSkills().save()`.
 * On `ConflictError` we surface `ConflictDialog` and let the user pick
 * "Reload from server" (overwrite the editor) or "Cancel" (keep edits).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  FileText,
  Folder,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useSkills } from './useSkills';
import { ConflictDialog } from './ConflictDialog';
import { ConflictError, type SkillDetail, type SkillItem } from './types';

type CategoryFilter = 'All' | 'Memory' | 'Code' | 'Web' | 'Image' | 'Voice' | 'Custom';
type SourceTab = 'installed' | 'bundled';

const CATEGORY_OPTIONS: CategoryFilter[] = [
  'All',
  'Memory',
  'Code',
  'Web',
  'Image',
  'Voice',
  'Custom',
];

/**
 * Map free-form server categories to one of the seven UI buckets. Anything
 * we don't recognise lands in `Custom` so the filter pills stay stable.
 */
function bucketCategory(raw: string | null | undefined): CategoryFilter {
  if (!raw) return 'Custom';
  const normalised = raw.toLowerCase();
  if (normalised.includes('memory')) return 'Memory';
  if (normalised.includes('code') || normalised.includes('dev')) return 'Code';
  if (normalised.includes('web') || normalised.includes('http') || normalised.includes('browse'))
    return 'Web';
  if (normalised.includes('image') || normalised.includes('vision') || normalised.includes('photo'))
    return 'Image';
  if (normalised.includes('voice') || normalised.includes('audio') || normalised.includes('speech'))
    return 'Voice';
  return 'Custom';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function shortHash(hash: string): string {
  if (!hash) return '—';
  return `${hash.slice(0, 7)}…`;
}

export function SkillsScreen() {
  const { skills, loading, error, refresh, install, uninstall, loadDetail, save } = useSkills();

  const [tab, setTab] = useState<SourceTab>('installed');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictError | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Active list per tab. When the bundled tab is empty (current server
  // doesn't expose it) we still show the empty state instead of redirecting
  // — that keeps the UI honest about the gap.
  const activeList: SkillItem[] = tab === 'installed' ? skills.installed : skills.bundled;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeList.filter((s) => {
      if (category !== 'All' && bucketCategory(s.category) !== category) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.category ?? '').toLowerCase().includes(q)
      );
    });
  }, [activeList, search, category]);

  const selected: SkillItem | null = useMemo(() => {
    if (!selectedId) return null;
    return (
      skills.installed.find((s) => s.id === selectedId) ??
      skills.bundled.find((s) => s.id === selectedId) ??
      null
    );
  }, [skills, selectedId]);

  // Load detail whenever the selection changes.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDraft('');
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    loadDetail(selectedId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setDraft(d.content);
        setSavedAt(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetailError(err instanceof Error ? err.message : 'Failed to load skill content');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadDetail]);

  const dirty = detail !== null && draft !== detail.content;

  const handleInstall = useCallback(
    async (id: string) => {
      setActionInProgress(id);
      try {
        await install(id);
      } catch {
        // useSkills already surfaces error in `error` state.
      } finally {
        setActionInProgress(null);
      }
    },
    [install]
  );

  const handleUninstall = useCallback(
    async (id: string) => {
      setActionInProgress(id);
      try {
        await uninstall(id);
      } catch {
        // surfaced via hook error
      } finally {
        setActionInProgress(null);
      }
    },
    [uninstall]
  );

  const handleSave = useCallback(async () => {
    if (!selected || !detail) return;
    setActionInProgress(selected.id);
    setDetailError(null);
    try {
      const next = await save(selected.id, draft, detail.contentHash);
      setDetail(next);
      setDraft(next.content);
      setSavedAt(Date.now());
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflict(err);
      } else {
        setDetailError(err instanceof Error ? err.message : 'Failed to save');
      }
    } finally {
      setActionInProgress(null);
    }
  }, [selected, detail, draft, save]);

  const handleReloadDetail = useCallback(async () => {
    if (!selectedId) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const d = await loadDetail(selectedId);
      setDetail(d);
      setDraft(d.content);
      setSavedAt(null);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to reload');
    } finally {
      setDetailLoading(false);
    }
  }, [selectedId, loadDetail]);

  const handleConflictReload = useCallback(() => {
    if (!conflict) return;
    setDraft(conflict.latestContent);
    // Snapshot a fresh detail using the conflict's latest content. The next
    // save round-trip will re-hash anyway, but updating here keeps the
    // footer hash and "Last loaded" line in sync immediately.
    setDetail({
      content: conflict.latestContent,
      contentHash: conflict.actualHash,
      exists: true,
      loadedAt: Date.now(),
    });
    setConflict(null);
    setSavedAt(null);
  }, [conflict]);

  return (
    <div className="h-full flex bg-zinc-950 animate-fade-in text-zinc-100">
      {/* ─── Left panel — list ─── */}
      <div className="flex w-[360px] shrink-0 flex-col border-r border-zinc-800">
        {/* Header */}
        <div className="shrink-0 border-b border-zinc-800 px-3 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Skills</h2>
              <span className="text-[11px] text-zinc-600">
                {skills.installed.length} installed · {skills.bundled.length} bundled
              </span>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors duration-150"
              title="Refresh skill list"
              aria-label="Refresh skill list"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-amber-500"
            />
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-1">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-150 ${
                  category === cat
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-zinc-900 p-0.5">
            {(['installed', 'bundled'] as const).map((t) => {
              const count = t === 'installed' ? skills.installed.length : skills.bundled.length;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150 ${
                    tab === t
                      ? 'bg-zinc-800 text-amber-400 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {t === 'installed' ? 'Installed' : 'Bundled'} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* List body */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{error}</span>
            </div>
          )}

          {loading && filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-600">
              <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-transparent" />
              Loading skills...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-zinc-600">
              {tab === 'bundled' && skills.bundled.length === 0
                ? 'No bundled skills available from this server.'
                : search || category !== 'All'
                  ? 'No skills match your filter.'
                  : 'No skills available.'}
            </div>
          ) : (
            <ul className="space-y-1 p-2">
              {filtered.map((s) => {
                const isSelected = s.id === selectedId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
                        isSelected
                          ? 'border-amber-500/40 bg-amber-500/5'
                          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                          {s.name}
                        </span>
                        {s.version && (
                          <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-800 px-1.5 py-px text-[10px] text-zinc-400">
                            v{s.version}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{s.description}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {s.has_references && (
                          <SkillBadge icon={<Folder size={9} />} label="references" />
                        )}
                        {s.has_scripts && (
                          <SkillBadge icon={<FileText size={9} />} label="scripts" />
                        )}
                        {s.has_templates && (
                          <SkillBadge icon={<FileText size={9} />} label="templates" />
                        )}
                        {s.installed && (
                          <span className="rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] text-emerald-400">
                            Installed
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ─── Right panel — detail + editor ─── */}
      <div className="flex flex-1 flex-col min-w-0">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-zinc-600">
            <Sparkles size={28} className="text-zinc-700" />
            <p className="text-sm">Select a skill to view details.</p>
            <p className="max-w-sm text-center text-xs text-zinc-700">
              The right panel will show the SKILL.md editor and install
              actions for the selected skill.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-zinc-100">
                      {selected.name}
                    </h3>
                    {selected.version && (
                      <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-800 px-1.5 py-px text-[10px] text-zinc-400">
                        v{selected.version}
                      </span>
                    )}
                    <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-px text-[10px] uppercase tracking-wide text-zinc-500">
                      {selected.source}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{selected.description}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {selected.installed ? (
                    <button
                      type="button"
                      onClick={() => void handleUninstall(selected.id)}
                      disabled={actionInProgress === selected.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 disabled:opacity-50 transition-colors duration-150"
                    >
                      <Trash2 size={12} />
                      Uninstall
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleInstall(selected.id)}
                      disabled={actionInProgress === selected.id}
                      className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50 transition-colors duration-150"
                    >
                      <Plus size={12} />
                      Install
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={!dirty || actionInProgress === selected.id || !detail}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-transparent disabled:text-zinc-600 transition-colors duration-150"
                    title={dirty ? 'Save SKILL.md changes' : 'No changes to save'}
                  >
                    <Save size={12} />
                    Save
                  </button>
                </div>
              </div>
            </div>

            {/* Editor */}
            <div className="flex flex-1 flex-col min-h-0 bg-zinc-950">
              {detailError && (
                <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1 break-words">{detailError}</span>
                </div>
              )}

              {detailLoading && !detail ? (
                <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
                  <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-transparent" />
                  Loading SKILL.md...
                </div>
              ) : (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="flex-1 resize-none border-0 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200 outline-none placeholder-zinc-700"
                  placeholder={detail?.exists === false
                    ? 'No SKILL.md found on the server. Type new content here and click Save to create it.'
                    : '# SKILL.md\n\nYour skill definition…'}
                />
              )}

              {/* Footer */}
              <div className="shrink-0 border-t border-zinc-800 px-4 py-2">
                <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500">
                  <div className="flex items-center gap-3">
                    <span>
                      Last loaded: {detail ? formatTime(detail.loadedAt) : '—'}
                    </span>
                    <span className="font-mono">
                      Hash: {shortHash(detail?.contentHash ?? '')}
                    </span>
                    {dirty && <span className="text-amber-400">unsaved changes</span>}
                    {savedAt !== null && !dirty && (
                      <span className="text-emerald-400">saved at {formatTime(savedAt)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleReloadDetail()}
                    disabled={detailLoading || !selected}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50 transition-colors duration-150"
                  >
                    <RefreshCw size={10} className={detailLoading ? 'animate-spin' : ''} />
                    Reload from server
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {conflict && (
        <ConflictDialog
          error={conflict}
          onReload={handleConflictReload}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  );
}

function SkillBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-px text-[10px] text-zinc-400">
      {icon}
      {label}
    </span>
  );
}
