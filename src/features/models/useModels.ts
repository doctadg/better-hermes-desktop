/**
 * Models feature — React hook wrapping `window.hermesAPI.models.*`.
 *
 * Centralises the load/save/remove flow so the screen + chat picker can
 * share a single, predictable surface. Returns a refresh function so the
 * caller can re-pull on focus or after a manual edit.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ModelRow } from './types';

/**
 * The legacy `HermesAPI` interface in `src/api/types.ts` predates the
 * sqlite-backed model library and does not include `models`. The preload
 * file `electron/preload.ts` is the source of truth — we cast through
 * `unknown` to a narrow shape that mirrors only the calls this feature
 * needs, without touching the global ambient declaration.
 */
interface ModelsBridge {
  list: () => Promise<ModelRow[]>;
  add: (m: Omit<ModelRow, 'created_at'>) => Promise<void>;
  update: (m: Omit<ModelRow, 'created_at'>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

interface PreloadShape {
  models?: ModelsBridge;
}

function getBridge(): ModelsBridge | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { hermesAPI?: PreloadShape }).hermesAPI;
  return api?.models ?? null;
}

export interface UseModelsResult {
  models: ModelRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (draft: Omit<ModelRow, 'created_at'>, mode: 'add' | 'update') => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useModels(): UseModelsResult {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) {
      setLoading(false);
      setError('Model library is unavailable (preload bridge missing).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await bridge.list();
      setModels(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (draft: Omit<ModelRow, 'created_at'>, mode: 'add' | 'update') => {
      const bridge = getBridge();
      if (!bridge) throw new Error('Model library is unavailable.');
      if (mode === 'add') {
        await bridge.add(draft);
      } else {
        await bridge.update(draft);
      }
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const bridge = getBridge();
      if (!bridge) throw new Error('Model library is unavailable.');
      await bridge.remove(id);
      await refresh();
    },
    [refresh],
  );

  return { models, loading, error, refresh, save, remove };
}
