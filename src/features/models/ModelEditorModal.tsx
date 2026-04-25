/**
 * Models feature — add / edit modal.
 *
 * Self-contained form: validation, base-URL auto-fill from preset, and
 * Esc-to-close. The parent owns the persistence call (`onSubmit`) so the
 * modal can be reused for both add and update flows.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  PROVIDERS,
  getProviderPreset,
  providerRequiresBaseUrl,
} from './providers';
import type { ModelRow, SavedModelDraft } from './types';

export interface ModelEditorModalProps {
  /** Existing row to edit, or `null` to add a new one. */
  initial: ModelRow | null;
  /** Called with a normalised draft when the user submits. */
  onSubmit: (draft: Omit<ModelRow, 'created_at'>, mode: 'add' | 'update') => Promise<void>;
  /** Called when the user cancels (Esc, backdrop click, X, Cancel). */
  onClose: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500 outline-none transition-colors duration-150';

const LABEL_CLASS = 'block text-xs font-medium text-zinc-400 mb-1';

function makeId(): string {
  // crypto.randomUUID is available in Electron's renderer (Chromium ≥ 92).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `model_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function ModelEditorModal({ initial, onSubmit, onClose }: ModelEditorModalProps) {
  const isEdit = initial !== null;

  const [draft, setDraft] = useState<SavedModelDraft>(() => ({
    id: initial?.id ?? '',
    name: initial?.name ?? '',
    provider: initial?.provider ?? PROVIDERS[0]?.id ?? 'custom',
    model: initial?.model ?? '',
    base_url: initial?.base_url ?? '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Esc closes the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const requiresBaseUrl = useMemo(
    () => providerRequiresBaseUrl(draft.provider),
    [draft.provider],
  );

  const handleProviderChange = useCallback(
    (next: string) => {
      setDraft((prev) => {
        const preset = getProviderPreset(next);
        // Only auto-fill base_url when the field is empty or matches a preset
        // default (so we don't clobber a user's custom URL).
        const prevPreset = getProviderPreset(prev.provider);
        const isPrevDefault =
          !!prevPreset?.defaultBaseUrl && prev.base_url === prevPreset.defaultBaseUrl;
        const nextBaseUrl =
          prev.base_url === '' || isPrevDefault
            ? preset?.defaultBaseUrl ?? ''
            : prev.base_url;
        return { ...prev, provider: next, base_url: nextBaseUrl };
      });
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = draft.name.trim();
      const model = draft.model.trim();
      const baseUrl = draft.base_url.trim();

      if (!name) {
        setError('Display name is required.');
        return;
      }
      if (!model) {
        setError('Model ID is required.');
        return;
      }
      if (requiresBaseUrl && !baseUrl) {
        setError('Base URL is required for this provider.');
        return;
      }

      setError(null);
      setSubmitting(true);
      try {
        const payload: Omit<ModelRow, 'created_at'> = {
          id: isEdit && draft.id ? draft.id : makeId(),
          name,
          provider: draft.provider,
          model,
          base_url: baseUrl ? baseUrl : null,
        };
        await onSubmit(payload, isEdit ? 'update' : 'add');
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save model.');
      } finally {
        setSubmitting(false);
      }
    },
    [draft, isEdit, onClose, onSubmit, requiresBaseUrl],
  );

  // Show the base-URL field for any provider that needs one OR that has a
  // sensible default (so users can see/override the local-runner URL).
  const preset = getProviderPreset(draft.provider);
  const showBaseUrl = requiresBaseUrl || !!preset?.defaultBaseUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit model' : 'Add model'}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-4 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">
            {isEdit ? 'Edit Model' : 'Add Model'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor="model-name" className={LABEL_CLASS}>
              Display name
            </label>
            <input
              id="model-name"
              type="text"
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Claude Sonnet 4"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="model-provider" className={LABEL_CLASS}>
              Provider
            </label>
            <select
              id="model-provider"
              value={draft.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className={INPUT_CLASS}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {preset?.setupUrl && (
              <p className="mt-1 text-[11px] text-zinc-500">
                Set up keys at{' '}
                <span className="text-zinc-400 font-mono">{preset.setupUrl}</span>
              </p>
            )}
          </div>

          <div>
            <label htmlFor="model-id" className={LABEL_CLASS}>
              Model ID
            </label>
            <input
              id="model-id"
              type="text"
              value={draft.model}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
              placeholder="anthropic/claude-sonnet-4-20250514"
              className={`${INPUT_CLASS} font-mono`}
              spellCheck={false}
            />
          </div>

          {showBaseUrl && (
            <div>
              <label htmlFor="model-base-url" className={LABEL_CLASS}>
                Base URL{requiresBaseUrl ? '' : ' (optional)'}
              </label>
              <input
                id="model-base-url"
                type="text"
                value={draft.base_url}
                onChange={(e) => setDraft((d) => ({ ...d, base_url: e.target.value }))}
                placeholder={preset?.defaultBaseUrl ?? 'http://localhost:1234/v1'}
                className={`${INPUT_CLASS} font-mono`}
                spellCheck={false}
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 transition-colors duration-150 disabled:opacity-40"
          >
            {submitting ? 'Saving...' : isEdit ? 'Update' : 'Add Model'}
          </button>
        </div>
      </form>
    </div>
  );
}
