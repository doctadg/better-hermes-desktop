/**
 * ProvidersTab — list of pluggable long-term memory providers.
 *
 * For each provider we render:
 *   - first-letter circle "logo"
 *   - name + description
 *   - "Configured" / "Not configured" pill (derived by reading
 *     `window.hermesAPI.storeGet(envVarName)` and checking for a
 *     non-empty string at runtime)
 *   - "Open dashboard" + "Setup docs" external links
 *
 * No mutation happens here — this tab is informational only. Activation /
 * env-var editing belongs to the Settings screen.
 */

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { MEMORY_PROVIDERS, type MemoryProviderInfo } from './providers';

// The preload exposes `storeGet`/`storeSet`/`invoke` on `window.hermesAPI`,
// but the renderer-side `HermesAPI` type in `src/api/types.ts` only models
// the IPC RPC surface. We pull the runtime methods we need via a narrow
// local interface and a single safe cast — no global typing changes.
interface PreloadBridge {
  storeGet?: <T = unknown>(key: string) => Promise<T | undefined>;
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

function getBridge(): PreloadBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { hermesAPI?: PreloadBridge };
  return w.hermesAPI ?? null;
}

async function checkConfigured(envVarName: string): Promise<boolean> {
  const bridge = getBridge();
  if (!bridge?.storeGet) return false;
  try {
    const value = await bridge.storeGet<unknown>(`env.${envVarName}`);
    if (typeof value === 'string') return value.trim().length > 0;
    if (value && typeof value === 'object' && 'value' in (value as object)) {
      const inner = (value as { value?: unknown }).value;
      return typeof inner === 'string' && inner.trim().length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

function openExternal(url: string): void {
  const bridge = getBridge();
  if (bridge?.invoke) {
    void bridge.invoke('open-external', { url });
    return;
  }
  // Fallback for non-electron dev environments.
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function ProviderLogo({ label }: { label: string }) {
  const initial = label.charAt(0).toUpperCase();
  return (
    <div className="shrink-0 w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-semibold text-amber-400">
      {initial}
    </div>
  );
}

function StatusPill({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-800">
        Configured
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
      Not configured
    </span>
  );
}

function ProviderCard({
  provider,
  configured,
}: {
  provider: MemoryProviderInfo;
  configured: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start gap-3">
        <ProviderLogo label={provider.label} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-200 truncate">
              {provider.label}
            </h3>
            <StatusPill configured={configured} />
          </div>
          <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
            {provider.description}
          </p>
          <div className="mt-2 text-[11px] text-zinc-600 font-mono">
            env: {provider.envVarName}
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => openExternal(provider.dashboardUrl)}
              className="inline-flex items-center gap-1 text-zinc-300 hover:text-amber-400"
            >
              Open dashboard <ExternalLink size={11} />
            </button>
            <button
              type="button"
              onClick={() => openExternal(provider.setupUrl)}
              className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200"
            >
              Setup docs <ExternalLink size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProvidersTab() {
  const [configuredMap, setConfiguredMap] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      MEMORY_PROVIDERS.map(async (p) => {
        const ok = await checkConfigured(p.envVarName);
        return [p.id, ok] as const;
      }),
    );
    setConfiguredMap(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <p className="text-xs text-zinc-500">
          Pluggable long-term memory providers. Set the API key for a provider
          in Settings to enable it — built-in MEMORY.md is always active alongside.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {MEMORY_PROVIDERS.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            configured={!!configuredMap[p.id]}
          />
        ))}
      </div>
    </div>
  );
}
