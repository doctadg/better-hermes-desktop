/**
 * Models feature — shared types.
 *
 * `ModelRow` is the canonical row shape stored in the sqlite-backed
 * `model_library` table. It is defined in `electron/preload.ts` and
 * re-exported here so renderer code never imports from the electron
 * folder directly.
 */

import type { ModelRow as PreloadModelRow } from '@electron/preload';

export type ModelRow = PreloadModelRow;

/**
 * Form/draft state for the editor modal. Mirrors the `Omit<ModelRow,
 * 'created_at'>` payload accepted by `window.hermesAPI.models.add` and
 * `.update`, but with `base_url` always present (the modal owns the input
 * value and normalises empty strings to `null` at submit time).
 */
export interface SavedModelDraft {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string;
}

/**
 * Convenience type used by the screen when grouping rows by provider.
 */
export interface ModelGroup {
  providerId: string;
  providerLabel: string;
  rows: ModelRow[];
}
