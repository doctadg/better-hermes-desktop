/**
 * Compare feature — searchable model picker.
 *
 * Reads the saved model library via `useModels()` (Phase 1) and renders
 * a dropdown grouped by provider. Used twice in `CompareScreen` — once
 * for the left model, once for the right.
 *
 * Visual style mirrors the rest of the app: `bg-zinc-900` shell,
 * `border-zinc-700`, `focus:border-amber-500` accent.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { useModels } from '@/features/models/useModels';
import { PROVIDERS, providerLabel } from '@/features/models/providers';
import type { ModelGroup, ModelRow } from '@/features/models/types';

export interface ModelPickerProps {
  /** Currently selected model, or `null` when no choice yet. */
  value: ModelRow | null;
  /** Called when the user picks a row. */
  onChange: (row: ModelRow) => void;
  /** Visible label shown above the trigger button. */
  label: string;
  /** Optional placeholder shown when nothing is selected. */
  placeholder?: string;
  /** Disable the trigger (e.g. while compare is running). */
  disabled?: boolean;
}

export function ModelPicker({
  value,
  onChange,
  label,
  placeholder = 'Choose a model...',
  disabled = false,
}: ModelPickerProps) {
  const { models, loading, error } = useModels();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Group filtered models by provider, in canonical PROVIDERS order with
  // unknown providers appended at the end. Mirrors the ModelsScreen logic.
  const groups = useMemo<ModelGroup[]>(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? models.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.model.toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q) ||
            providerLabel(m.provider).toLowerCase().includes(q),
        )
      : models;
    const byProvider = new Map<string, ModelRow[]>();
    for (const row of filtered) {
      const existing = byProvider.get(row.provider);
      if (existing) existing.push(row);
      else byProvider.set(row.provider, [row]);
    }
    const ordered: ModelGroup[] = [];
    const seen = new Set<string>();
    for (const preset of PROVIDERS) {
      const rows = byProvider.get(preset.id);
      if (rows && rows.length > 0) {
        ordered.push({ providerId: preset.id, providerLabel: preset.label, rows });
        seen.add(preset.id);
      }
    }
    for (const [pid, rows] of byProvider) {
      if (!seen.has(pid)) {
        ordered.push({ providerId: pid, providerLabel: providerLabel(pid), rows });
      }
    }
    return ordered;
  }, [models, search]);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent): void {
      const node = containerRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerText = value
    ? `${value.name}`
    : loading
      ? 'Loading models...'
      : placeholder;

  return (
    <div ref={containerRef} className="relative w-full">
      <label className="block text-[11px] uppercase tracking-wide font-medium text-zinc-500 mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled || loading}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-100 hover:border-zinc-600 focus:border-amber-500 outline-none transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm text-zinc-100">{triggerText}</div>
          {value && (
            <div className="truncate text-[11px] font-mono text-zinc-500">
              {providerLabel(value.provider)} · {value.model}
            </div>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 text-zinc-500 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {error && (
        <div className="mt-1 text-[11px] text-red-400">{error}</div>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1 max-h-80 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl flex flex-col animate-fade-in">
          <div className="shrink-0 relative border-b border-zinc-800">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
            />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, model id, or provider..."
              className="w-full pl-8 pr-8 py-2 bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="overflow-y-auto">
            {models.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-zinc-500">
                No saved models. Add one in the Models screen first.
              </div>
            ) : groups.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-zinc-500">
                No models match your search.
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.providerId} className="border-b border-zinc-800/60 last:border-b-0">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 bg-zinc-900/80 sticky top-0">
                    {group.providerLabel}
                  </div>
                  <ul>
                    {group.rows.map((row) => {
                      const isActive = value?.id === row.id;
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onChange(row);
                              setOpen(false);
                              setSearch('');
                            }}
                            className={`w-full flex flex-col items-start px-3 py-2 text-left hover:bg-zinc-800/70 transition-colors duration-100 ${
                              isActive ? 'bg-zinc-800/40' : ''
                            }`}
                          >
                            <span className="text-sm text-zinc-100 truncate w-full">
                              {row.name}
                            </span>
                            <span className="text-[11px] font-mono text-zinc-500 truncate w-full">
                              {row.model}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
