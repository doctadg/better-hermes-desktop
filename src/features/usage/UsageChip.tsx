/**
 * Hermes Desktop — UsageChip
 *
 * Compact pill that surfaces the current session's token usage in the chat
 * footer. Click to open the `UsageModal` for the full breakdown.
 *
 * Visuals:
 *   - Default: zinc-500 text, subtle zinc-800 border.
 *   - Streaming: amber-500 text, amber border, gentle pulse.
 *   - No usage data yet: muted "No usage" placeholder so layout is stable.
 *
 * The component reads from:
 *   - `useSessionUsage(sessionId)` — usage feature store
 *   - `useSessionIsStreaming(sessionId)` — chat store (READ-ONLY selector)
 *
 * Reading the chat store is the only cross-folder dependency in the chip
 * itself; it uses the existing public selector and never mutates.
 */

import { useState, useCallback, useMemo } from 'react';
import { Activity } from 'lucide-react';
import { useSessionIsStreaming } from '@/stores/chat';
import { useSessionUsage } from './usageStore';
import { formatTokens, formatCost } from './types';
import { UsageModal } from './UsageModal';

export interface UsageChipProps {
  /** Session this chip should display. May be `null` (renders muted state). */
  sessionId: string | null | undefined;
  /** Optional extra class — e.g. for spacing within the parent layout. */
  className?: string;
  /** Compact mode — hides the cost suffix even if available. */
  compact?: boolean;
}

export function UsageChip({ sessionId, className, compact }: UsageChipProps) {
  const usage = useSessionUsage(sessionId);
  const isStreaming = useSessionIsStreaming(sessionId);
  const [modalOpen, setModalOpen] = useState(false);

  const hasData = usage.cumulative.totalTokens > 0;
  const totalLabel = useMemo(
    () => formatTokens(usage.cumulative.totalTokens),
    [usage.cumulative.totalTokens]
  );
  const costLabel = useMemo(
    () => formatCost(usage.cumulative.costUsd),
    [usage.cumulative.costUsd]
  );

  const tooltip = useMemo(() => {
    if (!hasData) return 'No usage data yet — send a message to start tracking';
    const parts: string[] = [];
    parts.push(`Prompt: ${usage.cumulative.promptTokens.toLocaleString()} tok`);
    parts.push(
      `Completion: ${usage.cumulative.completionTokens.toLocaleString()} tok`
    );
    if (usage.cumulative.costUsd != null) {
      parts.push(`Cost: ${formatCost(usage.cumulative.costUsd)}`);
    }
    if (usage.cumulative.rateLimitRemaining != null) {
      parts.push(
        `Rate-limit remaining: ${usage.cumulative.rateLimitRemaining.toLocaleString()}`
      );
    }
    parts.push('Click for details');
    return parts.join(' · ');
  }, [hasData, usage.cumulative]);

  const handleClick = useCallback(() => {
    if (!sessionId) return;
    setModalOpen(true);
  }, [sessionId]);

  const colorClasses = isStreaming
    ? 'text-amber-500 border-amber-500/30 hover:border-amber-500/50'
    : hasData
      ? 'text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
      : 'text-zinc-600 border-zinc-800/60 hover:text-zinc-500';

  const iconClasses = isStreaming
    ? 'text-amber-500 animate-pulse'
    : hasData
      ? 'text-zinc-500'
      : 'text-zinc-700';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={!sessionId}
        title={tooltip}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border bg-zinc-900/50 text-[10px] font-mono leading-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${colorClasses} ${className ?? ''}`}
      >
        <Activity size={10} className={iconClasses} aria-hidden />
        {hasData ? (
          <span className="tabular-nums">
            {totalLabel} tokens
            {!compact && usage.cumulative.costUsd != null && (
              <span className="ml-1 text-zinc-500">· {costLabel}</span>
            )}
          </span>
        ) : (
          <span className="tabular-nums">No usage</span>
        )}
      </button>
      {modalOpen && sessionId && (
        <UsageModal
          sessionId={sessionId}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
