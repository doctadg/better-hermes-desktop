/**
 * Hermes Desktop — UsageModal
 *
 * Full breakdown of token usage and estimated cost. Triggered by clicking
 * the `UsageChip` or by the `/usage` slash command.
 *
 * Layout:
 *   - Header: session id + close button
 *   - Two side-by-side cards: "Current run" / "Cumulative"
 *   - Per-row: prompt / completion / total / cost / rate-limit
 *   - Footer: "Clear usage for this session" action.
 *
 * Pure presentation component — reads the usage store, no other dependencies.
 */

import { useEffect, useCallback } from 'react';
import { Activity, DollarSign, Zap, X } from 'lucide-react';
import { useSessionUsage, useUsageStore } from './usageStore';
import { formatCost, type TokenUsage } from './types';

export interface UsageModalProps {
  sessionId: string;
  onClose: () => void;
}

export function UsageModal({ sessionId, onClose }: UsageModalProps) {
  const usage = useSessionUsage(sessionId);
  const clearUsage = useUsageStore((s) => s.clearUsage);

  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleClear = useCallback(() => {
    clearUsage(sessionId);
    onClose();
  }, [clearUsage, sessionId, onClose]);

  const updatedAtLabel =
    usage.updatedAt > 0
      ? new Date(usage.updatedAt).toLocaleString()
      : '—';

  return (
    <div
      onMouseDown={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Token usage details"
    >
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
              <Activity size={16} className="text-amber-400" aria-hidden />
            </div>
            <div>
              <h2 className="text-sm font-medium text-zinc-100">Token usage</h2>
              <p className="text-[11px] text-zinc-500 font-mono">
                Session {sessionId.slice(0, 8)}… · updated {updatedAtLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UsageCard
            title="Current run"
            subtitle="Most recent assistant turn"
            usage={usage.current}
            accentClass="text-amber-400 border-amber-500/30 bg-amber-500/5"
          />
          <UsageCard
            title="Cumulative"
            subtitle="All-time for this session"
            usage={usage.cumulative}
            accentClass="text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800/80 bg-zinc-900/40">
          <p className="text-[11px] text-zinc-500">
            Cost is reported by the server when available. A dash (—) means no
            cost data was supplied for this session.
          </p>
          <button
            type="button"
            onClick={handleClear}
            disabled={usage.cumulative.totalTokens === 0}
            className="px-2.5 py-1 rounded-md text-[11px] text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 border border-zinc-800 hover:border-rose-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear session usage
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── UsageCard ────────────────────────────────────────────────────────────

interface UsageCardProps {
  title: string;
  subtitle: string;
  usage: TokenUsage;
  /** Tailwind class string for the card-header accent (icon + border tint). */
  accentClass: string;
}

function UsageCard({ title, subtitle, usage, accentClass }: UsageCardProps) {
  const empty = usage.totalTokens === 0;
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-medium text-zinc-100 uppercase tracking-wide">
            {title}
          </h3>
          <p className="text-[10px] text-zinc-500">{subtitle}</p>
        </div>
        <div
          className={`p-1.5 rounded-md border ${accentClass.split(' ').filter((c) => !c.startsWith('text-')).join(' ')}`}
        >
          <Zap size={12} className={accentClass.split(' ').find((c) => c.startsWith('text-')) ?? ''} aria-hidden />
        </div>
      </div>

      {empty ? (
        <p className="text-xs text-zinc-600 italic py-4 text-center">
          No data yet.
        </p>
      ) : (
        <dl className="space-y-1.5 text-xs font-mono">
          <Row label="Prompt" value={usage.promptTokens.toLocaleString()} />
          <Row
            label="Completion"
            value={usage.completionTokens.toLocaleString()}
          />
          <Row
            label="Total"
            value={usage.totalTokens.toLocaleString()}
            emphasize
          />
          <Row
            label="Cost"
            value={formatCost(usage.costUsd)}
            icon={<DollarSign size={10} className="text-zinc-500" />}
          />
          {usage.rateLimitRemaining != null && (
            <Row
              label="Rate-limit"
              value={`${usage.rateLimitRemaining.toLocaleString()} left`}
            />
          )}
          {usage.rateLimitReset != null && (
            <Row
              label="Resets"
              value={new Date(usage.rateLimitReset * 1000).toLocaleTimeString()}
            />
          )}
        </dl>
      )}
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  emphasize?: boolean;
}

function Row({ label, value, icon, emphasize }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-1 text-zinc-500">
        {icon}
        <span>{label}</span>
      </dt>
      <dd
        className={`tabular-nums ${
          emphasize ? 'text-zinc-100 font-medium' : 'text-zinc-300'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
