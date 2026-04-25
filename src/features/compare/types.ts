/**
 * Compare feature — shared types.
 *
 * Phase 3Q "Model A/B compare" sends the same prompt to two different
 * models simultaneously and shows a side-by-side comparison of output,
 * latency, and token usage.
 *
 * `ModelRow` is re-imported from the Models feature (Phase 1) — same
 * sqlite-backed library powers the picker.
 */

import type { ModelRow } from '@/features/models/types';

/**
 * The active comparison configuration. Both sides must be set for a
 * compare run to be valid.
 *
 * - `left` / `right`: the two `ModelRow`s being compared.
 * - `sessionIdLeft` / `sessionIdRight`: per-side session ids generated
 *   via `generateSessionId()` from the chat store. Each side runs in
 *   its own session so streams, tool calls, and history don't cross.
 */
export interface CompareConfig {
  left: ModelRow;
  right: ModelRow;
  sessionIdLeft: string;
  sessionIdRight: string;
}

/**
 * Per-side metrics for a single compare turn.
 *
 * - `latencyMs`: time from user-press-send to first streamed token (TTFB
 *   for the assistant). `undefined` until the first token arrives.
 * - `promptTokens` / `completionTokens`: pulled from the usage store
 *   when the provider reports them. May stay `undefined` if the server
 *   doesn't surface usage.
 * - `costUsd`: same provenance as tokens — optional.
 * - `completedAt`: epoch ms when streaming ended for this side.
 *
 * All fields are optional so the chip can render meaningfully at any
 * point in the request lifecycle (pre-send, mid-stream, completed).
 */
export interface CompareMetric {
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  completedAt?: number;
}

/**
 * Display side identifier — used to address pane[0] vs pane[1] without
 * leaking the layout-store pane id strings into the compare API.
 */
export type CompareSide = 'left' | 'right';

/** Empty/zero metric — safe to share as a stable reference. */
export const EMPTY_COMPARE_METRIC: CompareMetric = {};
