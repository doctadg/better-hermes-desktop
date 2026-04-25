/**
 * Gateways feature — React hook providing computed status + KV helpers.
 *
 * Status derivation:
 *   1. If the server's `/api/gateway/status` returns a row for this
 *      platform, surface the bridge-side truth (`Connected` / `Error`).
 *   2. Otherwise, infer from local KV: any saved env value → `Configured`,
 *      else `Not configured`.
 *
 * The hook owns no global state — the platform catalogue is static and
 * env values are read straight from `window.hermesAPI.storeGet/storeSet`.
 * Callers should call `refresh()` after a `setEnvValue` to recompute.
 *
 * Phase 0 surface: see `src/features/tools/mcpStorage.ts` for the same
 * pattern of typing the KV bridge locally because the global `HermesAPI`
 * declaration in `src/api/types.ts` predates `storeGet/storeSet`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnectionStore } from '@/stores/connection';
import type { GatewayStatusResponse } from '@/api/types';

import { PLATFORMS, type PlatformDef } from './platforms';

export type PlatformStatus =
  | 'connected'
  | 'configured'
  | 'not_configured'
  | 'error';

export interface ComputedPlatform {
  def: PlatformDef;
  status: PlatformStatus;
  /** Number of saved env values (used for the "X of Y configured" hint). */
  savedCount: number;
}

interface KvBridge {
  storeGet: <T = unknown>(key: string) => Promise<T | undefined>;
  storeSet: (key: string, value: unknown) => Promise<void>;
}

interface PreloadShape {
  storeGet?: KvBridge['storeGet'];
  storeSet?: KvBridge['storeSet'];
}

function getKvBridge(): KvBridge | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { hermesAPI?: PreloadShape }).hermesAPI;
  if (!api?.storeGet || !api?.storeSet) return null;
  return { storeGet: api.storeGet, storeSet: api.storeSet };
}

/** Build the KV key that owns a single env-var value for a platform. */
export function envKey(platformId: string, envName: string): string {
  return `gateway.env.${platformId}.${envName}`;
}

export interface UseGatewaysResult {
  /** Catalogue + computed status, in the order the caller passed in. */
  platforms: ComputedPlatform[];
  /** Raw status response from the server, or null while unfetched. */
  serverStatus: GatewayStatusResponse | null;
  /** True while either the env snapshot or the server status is loading. */
  loading: boolean;
  /** Surface-level error (server fetch only — KV failures are silent). */
  error: string | null;
  /** Re-pull both server status and the local env snapshot. */
  refresh: () => Promise<void>;
  /** Read the saved value for one env var. Empty string when unset. */
  getEnvValue: (platformId: string, envName: string) => string;
  /**
   * Persist a single env var and refresh local state. Throws when the KV
   * bridge is unavailable.
   */
  setEnvValue: (
    platformId: string,
    envName: string,
    value: string,
  ) => Promise<void>;
}

/** Internal: snapshot of every platform's env values as a flat map. */
type EnvSnapshot = Record<string, string>;

async function loadEnvSnapshot(bridge: KvBridge): Promise<EnvSnapshot> {
  const out: EnvSnapshot = {};
  await Promise.all(
    PLATFORMS.flatMap((p) =>
      p.envVars.map(async (v) => {
        const key = envKey(p.id, v.name);
        try {
          const raw = await bridge.storeGet<unknown>(key);
          if (typeof raw === 'string' && raw.length > 0) {
            out[key] = raw;
          }
        } catch {
          /* swallow — a missing key is fine, malformed values are dropped */
        }
      }),
    ),
  );
  return out;
}

export function useGateways(): UseGatewaysResult {
  const getClient = useConnectionStore((s) => s.getClient);

  const [serverStatus, setServerStatus] = useState<GatewayStatusResponse | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<EnvSnapshot>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Server status — best-effort. A failure here just means we fall
    // back to KV-derived status; we still want the env snapshot.
    const client = getClient();
    let nextStatus: GatewayStatusResponse | null = null;
    if (client) {
      try {
        nextStatus = await client.getGatewayStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch gateway status');
      }
    }

    const bridge = getKvBridge();
    const nextSnapshot = bridge ? await loadEnvSnapshot(bridge) : {};

    setServerStatus(nextStatus);
    setSnapshot(nextSnapshot);
    setLoading(false);
  }, [getClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getEnvValue = useCallback(
    (platformId: string, envName: string): string => {
      return snapshot[envKey(platformId, envName)] ?? '';
    },
    [snapshot],
  );

  const setEnvValue = useCallback(
    async (platformId: string, envName: string, value: string): Promise<void> => {
      const bridge = getKvBridge();
      if (!bridge) {
        throw new Error('Storage bridge unavailable: window.hermesAPI.storeSet missing.');
      }
      const key = envKey(platformId, envName);
      await bridge.storeSet(key, value);
      // Patch local snapshot so the UI reflects the change without
      // waiting for a full refresh round-trip.
      setSnapshot((prev) => {
        const next = { ...prev };
        if (value.length === 0) {
          delete next[key];
        } else {
          next[key] = value;
        }
        return next;
      });
    },
    [],
  );

  const platforms = useMemo<ComputedPlatform[]>(() => {
    // Index server status by lowercase name for resilient matching.
    const serverByName = new Map<string, { enabled: boolean; connected: boolean }>();
    for (const row of serverStatus?.platforms ?? []) {
      serverByName.set(row.name.toLowerCase(), {
        enabled: row.enabled,
        connected: row.connected,
      });
    }

    return PLATFORMS.map((def) => {
      const savedCount = def.envVars.reduce((acc, v) => {
        return snapshot[envKey(def.id, v.name)] ? acc + 1 : acc;
      }, 0);

      const server = serverByName.get(def.id.toLowerCase());
      let status: PlatformStatus;
      if (server) {
        if (server.connected) {
          status = 'connected';
        } else if (server.enabled) {
          // Bridge thinks it's on but isn't talking — that's an error.
          status = 'error';
        } else if (savedCount > 0) {
          status = 'configured';
        } else {
          status = 'not_configured';
        }
      } else if (savedCount === 0) {
        status = 'not_configured';
      } else {
        status = 'configured';
      }

      return { def, status, savedCount };
    });
  }, [serverStatus, snapshot]);

  return {
    platforms,
    serverStatus,
    loading,
    error,
    refresh,
    getEnvValue,
    setEnvValue,
  };
}

/** UI helper — pretty status label for a pill. */
export function statusLabel(status: PlatformStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'configured':
      return 'Configured';
    case 'not_configured':
      return 'Not configured';
    case 'error':
      return 'Error';
  }
}

/** UI helper — Tailwind classes for the status pill. */
export function statusPillClass(status: PlatformStatus): string {
  switch (status) {
    case 'connected':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'configured':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'not_configured':
      return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    case 'error':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }
}
