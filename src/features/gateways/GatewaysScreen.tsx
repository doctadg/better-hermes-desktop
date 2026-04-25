/**
 * Gateways feature — master/detail orchestrator.
 *
 * Left rail: 16 platforms, alphabetical, with status pills.
 * Right pane: env-var editor for the selected platform via GatewayDetail.
 * Header: overall connection summary + manual refresh.
 */

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';

import { GatewayDetail } from './GatewayDetail';
import { PLATFORMS } from './platforms';
import {
  statusLabel,
  statusPillClass,
  useGateways,
  type PlatformStatus,
} from './useGateways';

const ORDER: PlatformStatus[] = ['error', 'connected', 'configured', 'not_configured'];

function rollup(platforms: ReadonlyArray<{ status: PlatformStatus }>): {
  connected: number;
  configured: number;
  not_configured: number;
  error: number;
} {
  const acc = { connected: 0, configured: 0, not_configured: 0, error: 0 };
  for (const p of platforms) acc[p.status] += 1;
  return acc;
}

export function GatewaysScreen(): React.JSX.Element {
  const { platforms, loading, error, refresh, getEnvValue, setEnvValue } = useGateways();

  const sorted = useMemo(() => {
    return [...platforms].sort((a, b) => {
      const aIdx = ORDER.indexOf(a.status);
      const bIdx = ORDER.indexOf(b.status);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.def.label.localeCompare(b.def.label);
    });
  }, [platforms]);

  const [selectedId, setSelectedId] = useState<string>(() => sorted[0]?.def.id ?? PLATFORMS[0].id);

  useEffect(() => {
    if (!sorted.find((p) => p.def.id === selectedId) && sorted.length > 0) {
      setSelectedId(sorted[0].def.id);
    }
  }, [sorted, selectedId]);

  const selected = sorted.find((p) => p.def.id === selectedId) ?? sorted[0];
  const counts = rollup(sorted);

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
        <Send className="w-4 h-4 text-amber-500" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Gateways</div>
          <div className="text-[11px] text-zinc-500">
            {counts.connected} connected · {counts.configured} configured · {counts.not_configured} idle
            {counts.error > 0 ? ` · ${counts.error} error` : ''}
          </div>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          title="Refresh status"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="shrink-0 px-4 py-2 text-xs text-rose-300 bg-rose-500/10 border-b border-rose-500/30">
          {error}
        </div>
      )}

      {/* Body: list | detail */}
      <div className="flex-1 flex min-h-0">
        {/* List */}
        <div className="shrink-0 w-64 border-r border-zinc-800 overflow-y-auto">
          {sorted.map((p) => {
            const Icon = p.def.icon;
            const isActive = p.def.id === selected?.def.id;
            return (
              <button
                key={p.def.id}
                onClick={() => setSelectedId(p.def.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2 ${
                  isActive
                    ? 'bg-zinc-900 border-amber-500'
                    : 'border-transparent hover:bg-zinc-900/60'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-500' : 'text-zinc-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-100 truncate">{p.def.label}</div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {p.savedCount > 0 && p.savedCount < p.def.envVars.length
                      ? `${p.savedCount}/${p.def.envVars.length} keys`
                      : p.def.envVars.length === 0
                        ? 'no config'
                        : `${p.def.envVars.length} keys`}
                  </div>
                </div>
                <span
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${statusPillClass(p.status)}`}
                  title={statusLabel(p.status)}
                >
                  {p.status === 'connected'
                    ? '●'
                    : p.status === 'configured'
                      ? '◐'
                      : p.status === 'error'
                        ? '!'
                        : '○'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selected ? (
            <GatewayDetail
              computed={selected}
              api={{ getEnvValue, setEnvValue, refresh }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
              No platforms registered.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
