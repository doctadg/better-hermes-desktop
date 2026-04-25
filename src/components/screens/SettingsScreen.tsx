import { useConnectionStore } from '@/stores/connection';
import type { GatewayStatusResponse } from '@/api/types';
import { useState, useEffect, useCallback } from 'react';

const SHORTCUTS = [
  { keys: 'Ctrl+B', description: 'Toggle session sidebar' },
  { keys: 'Ctrl+Shift+P', description: 'Toggle context panel' },
  { keys: 'Enter', description: 'Send message' },
  { keys: 'Shift+Enter', description: 'New line in input' },
  { keys: 'Escape', description: 'Close dialog / cancel' },
];

export function SettingsScreen() {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatusResponse | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState(true);

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const connections = useConnectionStore((s) => s.connections);
  const healthStatus = useConnectionStore((s) => s.healthStatus);
  const serverConfig = useConnectionStore((s) => s.serverConfig);
  const getClient = useConnectionStore((s) => s.getClient);

  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const health = activeConnectionId ? healthStatus[activeConnectionId] : null;

  const fetchGateway = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setGatewayLoading(true);
    try {
      const res = await client.getGatewayStatus();
      setGatewayStatus(res);
    } catch {
      // Gateway status is optional
    } finally {
      setGatewayLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    fetchGateway();
  }, [fetchGateway]);

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 animate-fade-in">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* About */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">About</h2>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="rgb(9 9 11)" strokeWidth="1.5">
                  <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" />
                  <path d="M8 5V11M5 7.5H11" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-200">Hermes Desktop</div>
                <div className="text-xs text-zinc-500">v0.2.0</div>
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              Built with Electron + React + TypeScript + Tailwind CSS
            </p>
          </div>
        </section>

        {/* Connection Info */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Connection</h2>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
            {activeConn ? (
              <>
                <InfoRow label="Server" value={activeConn.label} />
                <InfoRow label="URL" value={activeConn.url} mono />
                <InfoRow
                  label="Health"
                  value={
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${
                        health?.status === 'ok' || health?.status === 'healthy'
                          ? 'bg-emerald-500'
                          : health
                          ? 'bg-red-500'
                          : 'bg-zinc-600'
                      }`} />
                      {health?.status === 'ok' || health?.status === 'healthy'
                        ? 'Healthy'
                        : health
                        ? 'Error'
                        : 'Unknown'}
                    </span>
                  }
                />
                {health?.version && <InfoRow label="Version" value={health.version} />}
                {serverConfig?.profile && <InfoRow label="Profile" value={serverConfig.profile} />}
              </>
            ) : (
              <p className="text-sm text-zinc-500 italic">No active connection</p>
            )}
          </div>
        </section>

        {/* Gateway Status */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Gateway</h2>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
            {gatewayLoading ? (
              <div className="flex items-center justify-center py-2 text-zinc-600 text-sm">
                <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
                Checking...
              </div>
            ) : gatewayStatus ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${gatewayStatus.gateway_running ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                  <span className="text-sm text-zinc-300">
                    {gatewayStatus.gateway_running ? 'Gateway Running' : 'Gateway Stopped'}
                  </span>
                  {gatewayStatus.uptime != null && (
                    <span className="text-xs text-zinc-600 ml-auto">
                      Uptime: {Math.floor(gatewayStatus.uptime / 3600)}h {Math.floor((gatewayStatus.uptime % 3600) / 60)}m
                    </span>
                  )}
                </div>
                {gatewayStatus.platforms.length > 0 && (
                  <div className="space-y-1.5">
                    {gatewayStatus.platforms.map((p) => (
                      <div key={p.name} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">{p.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                            p.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-600'
                          }`}>
                            {p.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                          {p.enabled && (
                            <span className={`w-1.5 h-1.5 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 italic">Gateway status unavailable</p>
            )}
          </div>
        </section>

        {/* Keyboard Shortcuts */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Keyboard Shortcuts</h2>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">{s.description}</span>
                  <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-400 font-mono">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Theme */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Theme</h2>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-zinc-300">Dark Mode</div>
                <div className="text-xs text-zinc-600 mt-0.5">Light theme coming soon</div>
              </div>
              <div className="relative w-10 h-5 rounded-full bg-amber-500">
                <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white translate-x-5 transition-transform duration-150" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className={`text-zinc-300 text-right ${mono ? 'font-mono text-xs' : 'truncate ml-2'}`} title={typeof value === 'string' ? value : undefined}>
        {value}
      </span>
    </div>
  );
}
