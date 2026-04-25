/**
 * Default Model — picks the provider/model id used by new chats.
 *
 * Saving has two effects:
 *   1. Adds the (provider, model id, base URL) triple to the local
 *      model library via `window.hermesAPI.models.add`. The library is
 *      a sqlite-backed catalog; duplicate ids upsert.
 *   2. If a `HermesClient` is connected, pushes `{ model }` to the
 *      server config via `client.patchConfig` so subsequent requests use
 *      the new default. Failure is non-fatal — we surface a banner but
 *      keep the local change.
 *
 * NOTE: the spec referenced `client.updateConfig`; the actual method name
 * in `src/api/client.ts` is `patchConfig` and we are forbidden from
 * editing the client. Behavior is identical (PATCH `/api/config`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PROVIDERS, providerRequiresBaseUrl } from '@/features/models/providers';
import { useConnectionStore } from '@/stores/connection';

interface SaveStatus {
  kind: 'idle' | 'saving' | 'ok' | 'error';
  message?: string;
}

function deriveModelId(provider: string, modelName: string): string {
  // Stable id so saving the same provider+model upserts instead of duplicating.
  return `default:${provider}:${modelName}`.toLowerCase().replace(/\s+/g, '-');
}

export function DefaultModelSection(): React.JSX.Element {
  const [provider, setProvider] = useState<string>(PROVIDERS[0]?.id ?? 'openrouter');
  const [modelName, setModelName] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  const client = useConnectionStore((s) => s.client);

  // When provider changes and we have a known default base URL, prefill it
  // unless the user has already typed something custom.
  useEffect(() => {
    const preset = PROVIDERS.find((p) => p.id === provider);
    if (preset?.defaultBaseUrl && !baseUrl) {
      setBaseUrl(preset.defaultBaseUrl);
    }
    // We intentionally only depend on provider — auto-fill is a one-way
    // hint, not a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const requiresBaseUrl = useMemo(() => providerRequiresBaseUrl(provider), [provider]);
  const canSave = modelName.trim().length > 0 && (!requiresBaseUrl || baseUrl.trim().length > 0);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setStatus({ kind: 'saving' });
    const trimmedModel = modelName.trim();
    const trimmedBase = baseUrl.trim();
    const id = deriveModelId(provider, trimmedModel);
    const friendlyName = trimmedModel.split('/').pop() ?? trimmedModel;

    try {
      await window.hermesAPI?.models.add({
        id,
        name: friendlyName,
        provider,
        model: trimmedModel,
        base_url: trimmedBase || null,
      });

      let serverNote = '';
      if (client) {
        try {
          await client.patchConfig({ model: trimmedModel });
          serverNote = ' Pushed to server.';
        } catch (err) {
          serverNote = ` (Server update failed: ${err instanceof Error ? err.message : 'unknown error'})`;
        }
      }

      setStatus({ kind: 'ok', message: `Saved to model library.${serverNote}` });
      setTimeout(() => setStatus({ kind: 'idle' }), 3000);
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to save model',
      });
    }
  }, [canSave, modelName, baseUrl, provider, client]);

  return (
    <div className="space-y-4">
      <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
        <p className="text-xs text-zinc-500">
          Used as the default model for new chats. Saved to the local model library; if a server is connected,
          the server&apos;s active model is updated too.
        </p>

        <label className="block">
          <span className="block text-xs text-zinc-400 mb-1">Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 outline-none focus:border-amber-500"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-zinc-400 mb-1">Model id</span>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="e.g. anthropic/claude-opus-4.6"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-mono text-zinc-100 outline-none focus:border-amber-500"
          />
        </label>

        <label className="block">
          <span className="block text-xs text-zinc-400 mb-1">
            Base URL{requiresBaseUrl ? '' : ' (optional)'}
          </span>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-mono text-zinc-100 outline-none focus:border-amber-500"
          />
        </label>

        <div className="flex items-center justify-between pt-1">
          <div className="text-xs">
            {status.kind === 'ok' && <span className="text-emerald-400">{status.message}</span>}
            {status.kind === 'error' && <span className="text-red-400">{status.message}</span>}
            {status.kind === 'saving' && <span className="text-zinc-400">Saving…</span>}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || status.kind === 'saving'}
            className="px-4 py-1.5 text-xs rounded-lg bg-amber-500 text-zinc-950 font-medium hover:bg-amber-400 disabled:opacity-40"
          >
            Save default
          </button>
        </div>
      </section>
    </div>
  );
}

export default DefaultModelSection;
