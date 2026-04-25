/**
 * Hermes Desktop — Usage feature types
 *
 * Types for the per-session token usage tracker.
 *
 * `TokenUsage` mirrors the canonical OpenAI-style fields plus optional
 * derived/extension fields (cost in USD, rate-limit headers).
 *
 * `SessionUsage` keeps two views:
 *   - `current`    — usage observed during the most recent run / chunk batch.
 *                    Resets at the start of each new send.
 *   - `cumulative` — sum across the entire session lifetime, never reset
 *                    (until the session is cleared explicitly).
 *
 * `updatedAt` is epoch ms — useful for sorting / "last activity" display.
 */

export interface TokenUsage {
  /** Tokens consumed by the prompt / input / context. */
  promptTokens: number;
  /** Tokens generated as the assistant response. */
  completionTokens: number;
  /** Total tokens (prompt + completion). Always populated; if the server only
   *  sends one field, the missing one is treated as 0. */
  totalTokens: number;
  /** Estimated cost in USD. Optional — server may or may not send this. */
  costUsd?: number;
  /** Provider rate-limit: tokens/requests remaining in the current window. */
  rateLimitRemaining?: number;
  /** Provider rate-limit: epoch-seconds when the window resets. */
  rateLimitReset?: number;
}

export interface SessionUsage {
  /** Most recent run's usage (typically the last assistant turn). */
  current: TokenUsage;
  /** Lifetime totals for this session. Sum of every `current` ever recorded. */
  cumulative: TokenUsage;
  /** Epoch ms of the last `recordUsage` call that updated this entry. */
  updatedAt: number;
}

/** Empty zero-value `TokenUsage`. Pure constant — safe to share. */
export const EMPTY_TOKEN_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

/** Empty zero-value `SessionUsage`. Pure constant — safe to share. */
export const EMPTY_SESSION_USAGE: SessionUsage = {
  current: EMPTY_TOKEN_USAGE,
  cumulative: EMPTY_TOKEN_USAGE,
  updatedAt: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Sum two `TokenUsage` values. Optional fields are merged with these rules:
 *  - `costUsd` — added if either side has it; otherwise undefined.
 *  - `rateLimitRemaining` — takes the most recent (b > a) value if present.
 *  - `rateLimitReset` — same as remaining: most-recent wins.
 *
 * Pure; safe to call from selectors.
 */
export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const cost =
    a.costUsd != null || b.costUsd != null
      ? (a.costUsd ?? 0) + (b.costUsd ?? 0)
      : undefined;
  const rateLimitRemaining =
    b.rateLimitRemaining ?? a.rateLimitRemaining;
  const rateLimitReset = b.rateLimitReset ?? a.rateLimitReset;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    ...(cost != null ? { costUsd: cost } : {}),
    ...(rateLimitRemaining != null ? { rateLimitRemaining } : {}),
    ...(rateLimitReset != null ? { rateLimitReset } : {}),
  };
}

/**
 * Coerce a partial / loosely typed payload from an SSE event into a
 * well-formed `TokenUsage`. Servers vary in field naming; we accept both
 * snake_case and camelCase.
 */
export function normalizeTokenUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };
  const promptTokens = num(r.promptTokens ?? r.prompt_tokens ?? r.input_tokens);
  const completionTokens = num(
    r.completionTokens ?? r.completion_tokens ?? r.output_tokens
  );
  const totalTokens = num(
    r.totalTokens ?? r.total_tokens ?? promptTokens + completionTokens
  );

  // No useful fields present — treat as not a usage payload.
  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
    return null;
  }

  const costRaw = r.costUsd ?? r.cost_usd ?? r.cost;
  const costUsd = costRaw != null ? num(costRaw) : undefined;
  const rrRaw = r.rateLimitRemaining ?? r.rate_limit_remaining;
  const rateLimitRemaining = rrRaw != null ? num(rrRaw) : undefined;
  const rrResetRaw = r.rateLimitReset ?? r.rate_limit_reset;
  const rateLimitReset = rrResetRaw != null ? num(rrResetRaw) : undefined;

  return {
    promptTokens,
    completionTokens,
    totalTokens: totalTokens || promptTokens + completionTokens,
    ...(costUsd != null ? { costUsd } : {}),
    ...(rateLimitRemaining != null ? { rateLimitRemaining } : {}),
    ...(rateLimitReset != null ? { rateLimitReset } : {}),
  };
}

/**
 * Compact human display: "1.2k" / "342" / "12.4M".
 * Pure; safe in render.
 */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1000;
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
  }
  const m = n / 1_000_000;
  return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
}

/** Format a USD amount. Uses 4 decimals for sub-dollar, 2 above. */
export function formatCost(usd: number | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '—';
  if (usd === 0) return '$0.00';
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
