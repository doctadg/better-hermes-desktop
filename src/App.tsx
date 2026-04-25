import { useState, useCallback, useEffect } from 'react';
import {
  MessageSquare,
  History,
  Boxes,
  Brain,
  Heart,
  Sparkles,
  Wrench,
  CalendarClock,
  Send,
  Settings as SettingsIcon,
  FileCode,
  GitCompare,
  Cpu,
  LayoutGrid,
  Columns2,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ConnectionPicker } from '@/components/connection/ConnectionPicker';
import { ProfilePicker } from '@/components/connection/ProfilePicker';
import { ConnectionDialog } from '@/components/connection/ConnectionDialog';
import { SessionSidebar } from '@/components/sidebar/SessionSidebar';
import { ContextPanel } from '@/components/context/ContextPanel';
import { MemoryScreen } from '@/features/memory/MemoryScreen';
import { SoulScreen } from '@/features/soul/SoulScreen';
import { SkillsScreen } from '@/features/skills/SkillsScreen';
import { ToolsScreen } from '@/features/tools/ToolsScreen';
import SchedulesScreen from '@/features/cron/SchedulesScreen';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { DiffScreen } from '@/features/editor/DiffScreen';
import { HardwareScreen } from '@/components/screens/HardwareScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { ModelsScreen } from '@/features/models/ModelsScreen';
import { GatewaysScreen } from '@/features/gateways/GatewaysScreen';
import { SessionsScreen } from '@/features/sessions/SessionsScreen';
import { WorkspacesScreen } from '@/features/workspaces/WorkspacesScreen';
import { QuickSwitcher } from '@/features/workspaces/QuickSwitcher';
import { CompareScreen } from '@/features/compare/CompareScreen';
import { AuditScreen } from '@/features/audit/AuditScreen';
import { LocalNetScreen } from '@/features/localnet/LocalNetScreen';
import { useStreamUsageBridge } from '@/features/usage/useStreamUsageBridge';
import { PaneGrid } from '@/components/layout/PaneGrid';
import { PaneHud } from '@/components/layout/PaneHud';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { useConnectionStore } from '@/stores/connection';
import { useChatStore, generateSessionId } from '@/stores/chat';
import { useLayoutStore } from '@/stores/layout';

type NavItem =
  | 'chat'
  | 'sessions'
  | 'models'
  | 'memory'
  | 'soul'
  | 'skills'
  | 'tools'
  | 'editor'
  | 'diff'
  | 'schedules'
  | 'gateways'
  | 'hardware'
  | 'localnet'
  | 'workspaces'
  | 'compare'
  | 'audit'
  | 'settings';

interface NavDef {
  id: NavItem;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavDef[] = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare size={18} /> },
  { id: 'sessions', label: 'Sessions', icon: <History size={18} /> },
  { id: 'models', label: 'Models', icon: <Boxes size={18} /> },
  { id: 'compare', label: 'A/B Compare', icon: <Columns2 size={18} /> },
  { id: 'memory', label: 'Memory', icon: <Brain size={18} /> },
  { id: 'soul', label: 'Persona', icon: <Heart size={18} /> },
  { id: 'skills', label: 'Skills', icon: <Sparkles size={18} /> },
  { id: 'tools', label: 'Tools', icon: <Wrench size={18} /> },
  { id: 'editor', label: 'Editor', icon: <FileCode size={18} /> },
  { id: 'diff', label: 'Diff', icon: <GitCompare size={18} /> },
  { id: 'schedules', label: 'Schedules', icon: <CalendarClock size={18} /> },
  { id: 'gateways', label: 'Gateways', icon: <Send size={18} /> },
  { id: 'workspaces', label: 'Workspaces', icon: <LayoutGrid size={18} /> },
  { id: 'audit', label: 'Audit', icon: <ShieldCheck size={18} /> },
  { id: 'hardware', label: 'Hardware', icon: <Cpu size={18} /> },
  { id: 'localnet', label: 'Network', icon: <Wifi size={18} /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
];

export default function App() {
  // Bridge SSE chat-usage events into the per-session usage store. Safe no-op
  // until the chat store exposes subscribeToUsage (see usage/INTEGRATION.md).
  useStreamUsageBridge();

  const [activeNav, setActiveNav] = useState<NavItem>('chat');
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [contextWidth, setContextWidth] = useState(320);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [contextVisible, setContextVisible] = useState(false);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeProfile = useConnectionStore((s) => s.activeProfile);
  const isInitialized = useConnectionStore((s) => s.isInitialized);

  const ensureSession = useChatStore((s) => s.ensureSession);
  const streamingCount = useChatStore(
    (s) => Object.values(s.sessions).reduce((n, slice) => n + (slice.isStreaming ? 1 : 0), 0)
  );
  const anyStreaming = streamingCount > 0;

  const layout = useLayoutStore((s) => s.layout);
  const panes = useLayoutStore((s) => s.panes);
  const focusedPaneId = useLayoutStore((s) => s.focusedPaneId);
  const assignToFocused = useLayoutStore((s) => s.assignToFocused);

  const focusedSessionId = panes.find((p) => p.id === focusedPaneId)?.sessionId ?? null;
  const focusedStatusText = useChatStore(
    (s) => (focusedSessionId ? s.sessions[focusedSessionId]?.statusText : '') ?? ''
  );

  const wsConnected = !!activeConnectionId;

  // Make sure each session bound to a pane has a slice in the chat store
  // (so its WS gets opened by the pane's ChatView, and persisted history loads).
  useEffect(() => {
    for (const pane of panes) {
      if (pane.sessionId) ensureSession(pane.sessionId);
    }
  }, [panes, ensureSession]);

  // Global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setContextVisible((v) => !v);
      }
      if (e.ctrlKey && e.key === 'b' && !e.shiftKey) {
        e.preventDefault();
        setSidebarVisible((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        const sid = generateSessionId();
        ensureSession(sid);
        assignToFocused(sid);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setActiveNav('sessions');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ensureSession, assignToFocused]);

  // SessionsScreen dispatches `hermes:open-session` when the user clicks a session
  // in the FTS5 browser; route it to the focused chat pane.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId?: string }>).detail;
      const sid = detail?.sessionId;
      if (!sid) return;
      ensureSession(sid);
      assignToFocused(sid);
      setActiveNav('chat');
    };
    window.addEventListener('hermes:open-session', handler);
    return () => window.removeEventListener('hermes:open-session', handler);
  }, [ensureSession, assignToFocused]);

  const handleOpenConnectionDialog = useCallback((connectionId?: string) => {
    setEditingConnectionId(connectionId ?? null);
    setConnectionDialogOpen(true);
  }, []);

  const handleCloseConnectionDialog = useCallback(() => {
    setConnectionDialogOpen(false);
    setEditingConnectionId(null);
  }, []);

  const renderScreen = () => {
    switch (activeNav) {
      case 'sessions':
        return <SessionsScreen />;
      case 'models':
        return <ModelsScreen />;
      case 'memory':
        return <MemoryScreen />;
      case 'soul':
        return <SoulScreen />;
      case 'skills':
        return <SkillsScreen />;
      case 'tools':
        return <ToolsScreen />;
      case 'editor':
        return <EditorScreen />;
      case 'diff':
        return <DiffScreen />;
      case 'schedules':
        return <SchedulesScreen />;
      case 'gateways':
        return <GatewaysScreen />;
      case 'workspaces':
        return <WorkspacesScreen />;
      case 'compare':
        return <CompareScreen />;
      case 'audit':
        return <AuditScreen />;
      case 'hardware':
        return <HardwareScreen />;
      case 'localnet':
        return <LocalNetScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'chat':
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Top bar */}
      <div className="drag-region h-10 flex items-center px-3 border-b border-zinc-800 bg-zinc-950 shrink-0 gap-2">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500 shrink-0">
          <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" />
        </svg>
        <span className="text-sm font-semibold text-zinc-400 mr-2 shrink-0">Hermes</span>

        <div className="no-drag flex items-center gap-2 shrink-0">
          <ConnectionPicker onAddConnection={handleOpenConnectionDialog} />
          <ProfilePicker />
        </div>

        {/* Draggable spacer */}
        <div className="flex-1 self-stretch" />

        <div className="no-drag flex items-center gap-2 shrink-0">
          <QuickSwitcher />
          <PaneHud />
          <button
            onClick={() => setPaletteOpen(true)}
            className="px-2 py-1 rounded text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors duration-150 flex items-center gap-1"
            title="Open command palette (Cmd+K)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            <kbd className="font-mono">⌘K</kbd>
          </button>
          <button
            onClick={() => setSidebarVisible((v) => !v)}
            className={`p-1 rounded transition-colors duration-150 ${
              sidebarVisible
                ? 'bg-zinc-800 text-amber-500'
                : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Toggle session sidebar (Ctrl+B)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <line x1="5.5" y1="2" x2="5.5" y2="14" />
            </svg>
          </button>
          <button
            onClick={() => setContextVisible((v) => !v)}
            className={`p-1 rounded transition-colors duration-150 ${
              contextVisible
                ? 'bg-zinc-800 text-amber-500'
                : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Toggle context panel (Ctrl+Shift+P)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <line x1="10.5" y1="2" x2="10.5" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation sidebar */}
        <div className="shrink-0 w-12 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-2 gap-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`relative w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-colors duration-150 group ${
                activeNav === item.id
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
              title={item.label}
            >
              {item.icon}
              {activeNav === item.id && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber-500 rounded-r-full" />
              )}
              {anyStreaming && item.id === 'chat' && activeNav !== 'chat' && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              )}
              <span className="absolute left-full ml-2 px-2 py-1 text-[11px] font-medium bg-zinc-800 text-zinc-200 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* Content area — PaneGrid is always mounted (keep-alive) */}
        <div className="flex-1 min-w-0 overflow-hidden relative">
          <div className={activeNav === 'chat' ? 'h-full' : 'absolute inset-0 pointer-events-none overflow-hidden h-0 opacity-0'}>
            <div className="flex h-full">
              <AppLayout
                sidebarVisible={sidebarVisible}
                sidebarWidth={sidebarWidth}
                onSidebarWidthChange={setSidebarWidth}
                contextVisible={contextVisible}
                contextWidth={contextWidth}
                onContextWidthChange={setContextWidth}
                sidebar={
                  <SessionSidebarWrapper
                    visible={sidebarVisible}
                    onToggle={() => setSidebarVisible((v) => !v)}
                  />
                }
                chat={<PaneGrid />}
                context={<ContextPanel sessionId={focusedSessionId} />}
              />
            </div>
          </div>
          {activeNav !== 'chat' && (
            <div className="absolute inset-0 overflow-auto">
              {renderScreen()}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="h-6 flex items-center px-3 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-500 shrink-0 gap-4">
        {activeConnectionId ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${
                !isInitialized
                  ? 'bg-zinc-500'
                  : wsConnected
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
              }`} />
              {!isInitialized ? 'Connecting...' : wsConnected ? 'Connected' : 'Connecting...'}
            </span>
            {activeProfile && (
              <span className="flex items-center gap-1.5 text-zinc-400">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500">
                  <circle cx="8" cy="4" r="2.5" />
                  <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
                </svg>
                {activeProfile}
              </span>
            )}
            {anyStreaming && (
              <button
                onClick={() => setActiveNav('chat')}
                className="flex items-center gap-1 cursor-pointer text-amber-400 hover:text-amber-300 transition-colors"
              >
                <span className="inline-block w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin" />
                {streamingCount === 1
                  ? focusedStatusText || 'Streaming...'
                  : `${streamingCount} sessions streaming`}
              </button>
            )}
            <span className="ml-auto text-zinc-600">
              {layout} · {panes.filter((p) => p.sessionId).length}/{panes.length} bound
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            No connection
          </span>
        )}
      </div>

      {/* Connection dialog */}
      {connectionDialogOpen && (
        <ConnectionDialog
          connectionId={editingConnectionId}
          onClose={handleCloseConnectionDialog}
        />
      )}

      {/* Command palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function SessionSidebarWrapper({ visible: _visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Sessions</span>
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400 transition-colors duration-150"
          title="Collapse sidebar"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 2L6 8l4 6" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <SessionSidebar />
      </div>
    </div>
  );
}
