/**
 * Models feature — main screen.
 *
 * Lists every entry in the local model library, grouped by provider in
 * collapsible sections, with search-as-you-type filtering and inline
 * delete confirmation. Add / edit go through `ModelEditorModal`.
 */

import { useCallback, useMemo, useState } from 'react';
import { Boxes, ChevronDown, Plus, Search, Trash2 } from 'lucide-react';
import { DeleteConfirm } from './DeleteConfirm';
import { ModelEditorModal } from './ModelEditorModal';
import { PROVIDERS, providerLabel } from './providers';
import { useModels } from './useModels';
import type { ModelGroup, ModelRow } from './types';

export function ModelsScreen() {
  const { models, loading, error, save, remove } = useModels();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ModelRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [removing, setRemoving] = useState<string | null>(null);

  const handleToggleSection = useCallback((providerId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      setRemoving(id);
      try {
        await remove(id);
      } finally {
        setRemoving(null);
        setConfirmDelete(null);
      }
    },
    [remove],
  );

  // Filter -> group. Keep the canonical PROVIDERS order so the UI is
  // stable across reloads, then append any unknown providers at the end.
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm bg-zinc-950">
        <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading models...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Boxes size={16} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-100">Models</h2>
            <span className="text-xs text-zinc-600">
              {models.length} {models.length === 1 ? 'model' : 'models'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowAdd(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 transition-colors duration-150"
          >
            <Plus size={14} />
            Add model
          </button>
        </div>

        {models.length > 0 && (
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, model id, or provider..."
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 focus:border-amber-500 outline-none transition-colors duration-150"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {models.length === 0 ? (
          <EmptyState onAdd={() => setShowAdd(true)} />
        ) : groups.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            No models match your search.
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.providerId);
              return (
                <section
                  key={group.providerId}
                  className="border border-zinc-800 rounded-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleSection(group.providerId)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900 hover:bg-zinc-900/70 transition-colors duration-150"
                    aria-expanded={!isCollapsed}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        size={14}
                        className={`text-zinc-500 transition-transform duration-150 ${
                          isCollapsed ? '-rotate-90' : ''
                        }`}
                      />
                      <span className="text-xs font-semibold text-zinc-200">
                        {group.providerLabel}
                      </span>
                      <span className="text-[11px] text-zinc-600">
                        {group.rows.length}
                      </span>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <ul className="divide-y divide-zinc-800">
                      {group.rows.map((row) => (
                        <ModelListItem
                          key={row.id}
                          row={row}
                          isConfirmingDelete={confirmDelete === row.id}
                          isRemoving={removing === row.id}
                          onClick={() => {
                            if (confirmDelete) return; // ignore row click while a confirm is open
                            setEditing(row);
                            setShowAdd(false);
                          }}
                          onRequestDelete={() => setConfirmDelete(row.id)}
                          onConfirmDelete={() => handleDelete(row.id)}
                          onCancelDelete={() => setConfirmDelete(null)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {(showAdd || editing) && (
        <ModelEditorModal
          initial={editing}
          onSubmit={save}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface ModelListItemProps {
  row: ModelRow;
  isConfirmingDelete: boolean;
  isRemoving: boolean;
  onClick: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

function ModelListItem({
  row,
  isConfirmingDelete,
  isRemoving,
  onClick,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: ModelListItemProps) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className="group flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-zinc-900/50 cursor-pointer transition-colors duration-150"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-100 truncate">{row.name}</div>
          <div className="text-[11px] text-zinc-500 font-mono truncate">
            {providerLabel(row.provider)} · {row.model}
          </div>
          {row.base_url && (
            <div className="text-[11px] text-zinc-600 font-mono truncate">
              {row.base_url}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center">
          {isConfirmingDelete ? (
            <DeleteConfirm onConfirm={onConfirmDelete} onCancel={onCancelDelete} />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete();
              }}
              disabled={isRemoving}
              className="p-1.5 rounded-md text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-zinc-800 transition-all duration-150 disabled:opacity-40"
              aria-label={`Delete ${row.name}`}
              title="Delete model"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
        <Boxes size={20} className="text-amber-500" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-200 mb-1">No models yet</h3>
      <p className="text-xs text-zinc-500 max-w-sm mb-4">
        Add a model to make it available in the chat picker. Cloud providers, local
        runners (Ollama, LM Studio), and any OpenAI-compatible endpoint are supported.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 transition-colors duration-150"
      >
        <Plus size={14} />
        Add your first model
      </button>
    </div>
  );
}
