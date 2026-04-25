import { useState, useCallback, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ConnectionPicker } from '@/components/connection/ConnectionPicker';
import { ProfilePicker } from '@/components/connection/ProfilePicker';
import { ConnectionDialog } from '@/components/connection/ConnectionDialog';
import { SessionSidebar } from '@/components/sidebar/SessionSidebar';
import { ContextPanel } from '@/components/context/ContextPanel';
import { MemoryScreen } from '@/components/screens/MemoryScreen';
import { SoulScreen } from '@/components/screens/SoulScreen';
import { SkillsScreen } from '@/components/screens/SkillsScreen';
import { ToolsScreen } from '@/components/screens/ToolsScreen';
import { SchedulesScreen } from '@/components/screens/SchedulesScreen';
import { SettingsScreen } from '@/components/screens/SettingsScreen';
import { PaneGrid } from '@/components/layout/PaneGrid';
import { PaneHud } from '@/components/layout/PaneHud';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { useConnectionStore } from '@/stores/connection';
import { useChatStore, generateSessionId } from '@/stores/chat';
import { useLayoutStore } from '@/stores/layout';

type NavItem = 'chat' | 'sessions' | 'memory' | 'soul' | 'skills' | 'tools' | 'schedules' | 'settings';

interface NavDef {
  id: NavItem;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavDef[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 2h12v9H5l-3 3v-3H2V2z" />
      </svg>
    ),
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M1.5 3.5h13v10h-13v-10z" />
        <path d="M1.5 5.5h13" />
        <path d="M5 1.5v4" />
        <path d="M11 1.5v4" />
      </svg>
    ),
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 1.5C5 1.5 2.5 3 2.5 6c0 2 1 3.5 2.5 4.5L4 14.5l3-2c.3 0 .7.05 1 .05s.7-.05 1-.05l3 2-.5-4C12 9.5 13.5 8 13.5 6c0-3-2.5-4.5-5.5-4.5z" />
        <circle cx="6" cy="6" r="0.7" fill="currentColor" />
        <circle cx="10" cy="6" r="0.7" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'soul',
    label: 'Soul',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 14s-5-3.5-5-7.5C3 3.5 5.2 1.5 8 1.5S13 3.5 13 6.5C13 10.5 8 14 8 14z" />
        <path d="M6.5 6.5c0-0.3 0.7-1 1.5-1s1.5 0.7 1.5 1" />
        <circle cx="8" cy="9" r="0.7" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
        <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
        <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
        <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      </svg>
    ),
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 2L14 6l-1.5 1.5-4-4L10 2z" />
        <path d="M8.5 3.5l-6.2 6.2a1 1 0 000 1.4l2.6 2.6a1 1 0 001.4 0l6.2-6.2" />
      </svg>
    ),
  },
  {
    id: 'schedules',
    label: 'Schedules',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.5V8l2.5 1.5" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="2.5" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
      </svg>
    ),
  },
];

export default function App() {
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

  const wsConnected = !!activeConnectionId; // per-session WS state lives in chat slices; topbar dot is "any active connection"

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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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
      case 'memory':
        return <MemoryScreen />;
      case 'soul':
        return <SoulScreen />;
      case 'skills':
        return <SkillsScreen />;
      case 'tools':
        return <ToolsScreen />;
      case 'schedules':
        return <SchedulesScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'sessions':
        return (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
            <div className="text-center space-y-2">
              <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" className="text-zinc-700 mx-auto">
                <path d="M1.5 3.5h13v10h-13v-10z" />
                <path d="M1.5 5.5h13" />
                <path d="M5 1.5v4" />
                <path d="M11 1.5v4" />
              </svg>
              <p>Session browser coming soon.</p>
              <p className="text-xs text-zinc-700">Use the chat sidebar to manage sessions.</p>
            </div>
          </div>
        );
      case 'chat':
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Top bar */}
      <div className="drag-region h-10 flex items-center px-3 border-b border-zinc-800 bg-zinc-950 shrink-0 gap-2">
        <div className="no-drag flex items-center gap-2 flex-1">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500">
            <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" />
          </svg>
          <span className="text-sm font-semibold text-zinc-400 mr-2">Hermes</span>

          <ConnectionPicker onAddConnection={handleOpenConnectionDialog} />
          <ProfilePicker />
        </div>

        <div className="no-drag flex items-center gap-2">
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
        <div className="shrink-0 w-12 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-2 gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150 group ${
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

function SessionSidebarWrapper({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
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
