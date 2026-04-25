/**
 * Compare feature — bottom strip showing live per-side metrics.
 *
 * Renders below the dual chat panes whenever a `CompareConfig` is
 * active. Each side gets a card with:
 *   - model name + provider · model id
 *   - latency (ms to first token) — `Clock`
 *   - tokens (prompt / completion) — `Hash`
 *   - cost (USD) — `Zap`
 *
 * Values stream live: `latencyMs` populates as soon as the first token
 * arrives, tokens/cost when the usage store gets a usage event.
 */

import { Clock, Hash, Zap } from 'lucide-react';
import { providerLabel } from '@/features/models/providers';
import { formatCost, formatTokens } from '@/features/usage/types';
import type { ModelRow } from '@/features/models/types';
import type { CompareMetric } from './types';

export interface CompareMetricsProps {
  left: ModelRow;
  right: ModelRow;
  metrics: { left: CompareMetric; right: CompareMetric };
  isStreaming: { left: boolean; right: boolean };
}

export function CompareMetrics({ left, right, metrics, isStreaming }: CompareMetricsProps) {
  return (
    <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-3 py-2 grid grid-cols-2 gap-3">
      <SideCard
        side="A"
        model={left}
        metric={metrics.left}
        streaming={isStreaming.left}
      />
      <SideCard
        side="B"
        model={right}
        metric={metrics.right}
        streaming={isStreaming.right}
      />
    </div>
  );
}

interface SideCardProps {
  side: 'A' | 'B';
  model: ModelRow;
  metric: CompareMetric;
  streaming: boolean;
}

function SideCard({ side, model, metric, streaming }: SideCardProps) {
  const latency = metric.latencyMs;
  const promptTok = metric.promptTokens ?? 0;
  const completionTok = metric.completionTokens ?? 0;
  const totalTok = promptTok + completionTok;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
              {side}
            </span>
            <span className="text-sm font-semibold text-zinc-100 truncate">
              {model.name}
            </span>
          </div>
          <div className="text-[11px] font-mono text-zinc-500 truncate">
            {providerLabel(model.provider)} · {model.model}
          </div>
        </div>
        {streaming && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            streaming
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Metric
          icon={<Clock size={12} />}
          label="latency"
          value={latency != null ? `${formatLatency(latency)}` : '—'}
          accent={latency != null}
        />
        <Metric
          icon={<Hash size={12} />}
          label="tokens"
          value={
            totalTok > 0
              ? `${formatTokens(promptTok)} / ${formatTokens(completionTok)}`
              : '—'
          }
          accent={totalTok > 0}
        />
        <Metric
          icon={<Zap size={12} />}
          label="cost"
          value={formatCost(metric.costUsd)}
          accent={metric.costUsd != null && metric.costUsd > 0}
        />
      </div>
    </div>
  );
}

interface MetricProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: boolean;
}

function Metric({ icon, label, value, accent }: MetricProps) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="flex items-center gap-1 text-zinc-500 uppercase tracking-wide text-[10px]">
        {icon}
        {label}
      </span>
      <span
        className={`font-mono truncate ${accent ? 'text-zinc-100' : 'text-zinc-600'}`}
      >
        {value}
      </span>
    </div>
  );
}

function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
}
