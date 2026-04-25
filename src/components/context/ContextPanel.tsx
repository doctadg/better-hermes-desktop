import { useState, useEffect, useCallback } from 'react';
import {
  useSessionMessages,
  useSessionIsStreaming,
  useSessionStatusKind,
  useSessionStatusText,
} from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import type { ServerConfig, CommandInfo } from '@/api/types';

type Tab = 'session' | 'tools' | 'commands' | 'settings';

interface ContextPanelProps {
  sessionId?: string | null;
}

export function ContextPanel({ sessionId }: ContextPanelProps = {}) {
  const [activeTab, setActiveTab] = useState<Tab>('session');

  const messages = useSessionMessages(sessionId);
  const isStreaming = useSessionIsStreaming(sessionId);
  const statusKind = useSessionStatusKind(sessionId);
  const statusText = useSessionStatusText(sessionId);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const getClient = useConnectionStore((s) => s.getClient);
  const connections = useConnectionStore((s) => s.connections);
  const healthStatus = useConnectionStore((s) => s.healthStatus);
  const serverConfig = useConnectionStore((s) => s.serverConfig);
  const fetchServerConfig = useConnectionStore((s) => s.fetchServerConfig);

  const client = getClient();
  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const health = activeConnectionId ? healthStatus[activeConnectionId] : null;

  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [commandsLoading, setCommandsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch commands when tab is selected or connection changes
  const fetchCommands = useCallback(async () => {
    if (!client) return;
    setCommandsLoading(true);
    try {
      const res = await client.getCommands();
      setCommands(res.commands || []);
    } catch {
      setCommands([]);
    } finally {
      setCommandsLoading(false);
    }
  }, [client]);

  const fetchModels = useCallback(async () => {
    if (!client) return;
    try {
      const res = await client.getAvailableModels();
      setAvailableModels(res.models || []);
    } catch {
      setAvailableModels([]);
    }
  }, [client]);

  useEffect(() => {
    if (activeTab === 'commands') {
      fetchCommands();
    }
  }, [activeTab, fetchCommands, activeConnectionId]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels, activeConnectionId]);

  const handleRefreshConfig = useCallback(async () => {
    setRefreshing(true);
    setConfigError(null);
    try {
      await fetchServerConfig();
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to refresh config');
    } finally {
      setRefreshing(false);
    }
  }, [fetchServerConfig]);

  const handlePatchConfig = useCallback(async (key: string, value: unknown) => {
    if (!client) return;
    try {
      const res = await client.patchConfig({ [key]: value });
      useConnectionStore.setState({ serverConfig: res.config });
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to update config');
    }
  }, [client]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'session', label: 'Session' },
    { id: 'tools', label: 'Config' },
    { id: 'commands', label: 'Commands' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Tabs */}
      <div className="flex border-b border-zinc-800 px-2 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2.5 text-xs font-medium transition-colors duration-150 border-b-2 ${
              activeTab === tab.id
                ? 'text-amber-400 border-amber-500'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'session' && (
          <SessionTab
            activeConn={activeConn}
            health={health}
            sessionId={sessionId ?? null}
            messages={messages}
            isStreaming={isStreaming}
            statusKind={statusKind}
            statusText={statusText}
          />
        )}
        {activeTab === 'tools' && (
          <ConfigTab
            config={serverConfig}
            availableModels={availableModels}
            error={configError}
            refreshing={refreshing}
            onRefresh={handleRefreshConfig}
            onPatchConfig={handlePatchConfig}
            onClearError={() => setConfigError(null)}
          />
        )}
        {activeTab === 'commands' && (
          <CommandsTab
            commands={commands}
            loading={commandsLoading}
            onRefresh={fetchCommands}
          />
        )}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}

// ─── Session Tab ───
function SessionTab({
  activeConn,
  health,
  sessionId,
  messages,
  isStreaming,
  statusKind,
  statusText,
}: {
  activeConn?: { label: string; url: string } | undefined;
  health: { status?: string; version?: string; platform?: string } | null | undefined;
  sessionId: string | null;
  messages: Array<{ role: string }>;
  isStreaming: boolean;
  statusKind: string;
  statusText: string;
}) {
  return (
    <div className="space-y-4">
      <Section title="Connection">
        {activeConn ? (
          <div className="space-y-2">
            <InfoRow label="Server" value={activeConn.label} />
            <InfoRow label="URL" value={activeConn.url} mono />
            <InfoRow
              label="Status"
              value={
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      health?.status === 'ok' || health?.status === 'healthy'
                        ? 'bg-emerald-500'
                        : health
                        ? 'bg-red-500'
                        : 'bg-zinc-600'
                    }`}
                  />
                  {health?.status === 'ok' || health?.status === 'healthy'
                    ? 'Connected'
                    : health
                    ? 'Error'
                    : 'Unknown'}
                </span>
              }
            />
            {health?.platform && <InfoRow label="Platform" value={health.platform} />}
          </div>
        ) : (
          <div className="text-sm text-zinc-500 italic">No active connection</div>
        )}
      </Section>

      <Section title="Session">
        <div className="space-y-2">
          <InfoRow
            label="Session ID"
            value={sessionId ? (
              <span className="font-mono text-xs text-zinc-400 truncate max-w-[180px] block" title={sessionId}>
                {sessionId.slice(0, 12)}...
              </span>
            ) : 'None'}
          />
          <InfoRow label="Messages" value={String(messages.length)} />
          <InfoRow
            label="State"
            value={
              <span
                className={
                  isStreaming
                    ? statusKind === 'error'
                      ? 'text-red-400'
                      : 'text-amber-400'
                    : 'text-zinc-300'
                }
              >
                {isStreaming ? statusText || 'Streaming...' : 'Idle'}
              </span>
            }
          />
        </div>
      </Section>
    </div>
  );
}

// ─── Config Tab ───
function ConfigTab({
  config,
  availableModels,
  error,
  refreshing,
  onRefresh,
  onPatchConfig,
  onClearError,
}: {
  config: ServerConfig | null;
  availableModels: string[];
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onPatchConfig: (key: string, value: unknown) => void;
  onClearError: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Server Config</h3>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors duration-150"
          title="Refresh config"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={refreshing ? 'animate-spin' : ''}
          >
            <path d="M1 8a7 7 0 0 1 13-3.5M15 8a7 7 0 0 1-13 3.5" />
            <path d="M14 1v4h-4M2 15v-4h4" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={onClearError} className="text-red-500 hover:text-red-300">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      )}

      {config ? (
        <div className="space-y-3">
          {/* Model */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Model</label>
            <select
              value={config.model || ''}
              onChange={(e) => onPatchConfig('model', e.target.value)}
              className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
            >
              <option value="">Default</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Display name */}
          {config.model_name && (
            <InfoRow label="Model Name" value={config.model_name} />
          )}

          {/* Profile */}
          <InfoRow label="Profile" value={config.profile || 'default'} />

          {/* Skin */}
          <InfoRow label="Skin" value={config.skin || 'default'} />

          {/* Toggles */}
          <div className="space-y-2 pt-1">
            <ToggleRow
              label="Verbose"
              value={config.verbose ?? false}
              onChange={(v) => onPatchConfig('verbose', v)}
            />
            <ToggleRow
              label="YOLO Mode"
              value={config.yolo ?? false}
              onChange={(v) => onPatchConfig('yolo', v)}
            />
          </div>

          {/* Active Tools */}
          {config.active_tools && config.active_tools.length > 0 && (
            <div>
              <h4 className="text-xs text-zinc-500 mb-1.5">Active Tools ({config.active_tools.length})</h4>
              <div className="flex flex-wrap gap-1">
                {config.active_tools.map((tool) => (
                  <span key={tool} className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 rounded border border-zinc-700">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Other config keys */}
          {Object.entries(config).filter(([k, v]) =>
            !['model', 'model_name', 'verbose', 'yolo', 'profile', 'skin', 'active_tools'].includes(k) &&
            v !== undefined && v !== null
          ).length > 0 && (
            <div className="pt-2 border-t border-zinc-800">
              <h4 className="text-xs text-zinc-500 mb-1.5">Other Settings</h4>
              {Object.entries(config)
                .filter(([k, v]) =>
                  !['model', 'model_name', 'verbose', 'yolo', 'profile', 'skin', 'active_tools'].includes(k) &&
                  v !== undefined && v !== null
                )
                .map(([key, value]) => (
                  <InfoRow
                    key={key}
                    label={key}
                    value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
                    mono
                  />
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-zinc-500 italic py-2">
          No config loaded. Connect to a server first.
        </div>
      )}
    </div>
  );
}

// ─── Commands Tab ───
function CommandsTab({
  commands,
  loading,
  onRefresh,
}: {
  commands: CommandInfo[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [expandedCmd, setExpandedCmd] = useState<string | null>(null);

  // Group by category
  const categories = commands.reduce<Record<string, CommandInfo[]>>((acc, cmd) => {
    const cat = cmd.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cmd);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Slash Commands</h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors duration-150"
          title="Refresh commands"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={loading ? 'animate-spin' : ''}
          >
            <path d="M1 8a7 7 0 0 1 13-3.5M15 8a7 7 0 0 1-13 3.5" />
            <path d="M14 1v4h-4M2 15v-4h4" />
          </svg>
        </button>
      </div>

      {loading && commands.length === 0 ? (
        <div className="flex items-center justify-center py-4 text-zinc-600 text-sm">
          <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
          Loading...
        </div>
      ) : commands.length === 0 ? (
        <div className="text-sm text-zinc-500 italic py-2">
          No commands available.
        </div>
      ) : (
        Object.entries(categories).map(([category, cmds]) => (
          <div key={category}>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{category}</h4>
            <div className="space-y-0.5">
              {cmds.map((cmd) => (
                <div key={cmd.name}>
                  <button
                    onClick={() => setExpandedCmd(expandedCmd === cmd.name ? null : cmd.name)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800/50 text-left transition-colors duration-150"
                  >
                    <span className="font-mono text-xs text-amber-400 shrink-0">/{cmd.name}</span>
                    <span className="text-xs text-zinc-400 truncate flex-1">{cmd.description}</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className={`text-zinc-600 shrink-0 transition-transform duration-150 ${expandedCmd === cmd.name ? 'rotate-90' : ''}`}
                    >
                      <path d="M4.5 2l4 4-4 4" />
                    </svg>
                  </button>
                  {expandedCmd === cmd.name && (
                    <div className="ml-6 mt-0.5 mb-1 text-xs text-zinc-500 space-y-0.5">
                      <div>{cmd.description}</div>
                      {cmd.args_hint && <div className="text-zinc-600">Usage: /{cmd.name} {cmd.args_hint}</div>}
                      {cmd.aliases && cmd.aliases.length > 0 && (
                        <div className="text-zinc-600">Aliases: {cmd.aliases.map((a) => `/${a}`).join(', ')}</div>
                      )}
                      {cmd.subcommands && cmd.subcommands.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          <div className="text-zinc-500 font-medium">Subcommands:</div>
                          {cmd.subcommands.map((sub) => (
                            <div key={sub.name} className="text-zinc-600 pl-2">
                              <span className="font-mono text-amber-500/70">/{cmd.name} {sub.name}</span> — {sub.description}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Settings Tab ───
function SettingsTab() {
  return (
    <div className="space-y-4">
      <Section title="Keyboard Shortcuts">
        <div className="space-y-1.5 text-xs">
          <ShortcutRow keys="Ctrl+B" description="Toggle sidebar" />
          <ShortcutRow keys="Ctrl+Shift+P" description="Toggle context panel" />
          <ShortcutRow keys="Enter" description="Send message" />
          <ShortcutRow keys="Shift+Enter" description="New line" />
          <ShortcutRow keys="Escape" description="Close dialog" />
        </div>
      </Section>
      <Section title="About">
        <InfoRow label="App" value="Hermes Desktop" />
        <InfoRow label="Version" value="0.1.0" />
      </Section>
    </div>
  );
}

// ─── Shared Components ───
function Section({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className={`text-zinc-300 text-right ${mono ? 'font-mono text-xs' : 'truncate ml-2'}`} title={typeof value === 'string' ? value : undefined}>
        {value}
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-zinc-300">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors duration-150 ${
          value ? 'bg-amber-500' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150 ${
            value ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function ShortcutRow({ keys, description }: { keys: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-zinc-400">{description}</span>
      <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 font-mono">
        {keys}
      </kbd>
    </div>
  );
}
