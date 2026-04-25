import { useState, useRef, useCallback, useEffect } from 'react';
import { SessionItem } from './SessionItem';
import {
  useChatStore,
  generateSessionId,
} from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import { useLayoutStore } from '@/stores/layout';
import type { Session, SessionHistoryMessage, Message, ToolCallInfo } from '@/api/types';
import { getToolArgsPreview } from '@/api/types';

interface SessionSidebarProps {
  onNewChat?: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  sessionId: string;
}

function parseHistoryToolCalls(msg: SessionHistoryMessage): ToolCallInfo[] | undefined {
  if (!msg.tool_calls || !Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0) return undefined;

  return msg.tool_calls.map((tc: any, index: number) => {
    const argsStr = typeof tc.function?.arguments === 'string'
      ? tc.function.arguments
      : JSON.stringify(tc.function?.arguments || {});

    return {
      id: tc.id || `hist_tool_${index}`,
      name: tc.function?.name || tc.name || 'unknown',
      args: argsStr,
      argsPreview: getToolArgsPreview(argsStr),
      status: 'completed' as const,
      startedAt: Date.now(),
    };
  });
}

export function SessionSidebar({ onNewChat }: SessionSidebarProps) {
  const ensureSession = useChatStore((s) => s.ensureSession);
  const addMessage = useChatStore((s) => s.addMessage);

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeProfile = useConnectionStore((s) => s.activeProfile);
  const getClient = useConnectionStore((s) => s.getClient);
  const client = getClient();

  const focusedPaneId = useLayoutStore((s) => s.focusedPaneId);
  const panes = useLayoutStore((s) => s.panes);
  const assignToFocused = useLayoutStore((s) => s.assignToFocused);

  const focusedSessionId = panes.find((p) => p.id === focusedPaneId)?.sessionId ?? null;

  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSessions = useCallback(async (signal?: AbortSignal) => {
    if (!client) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await client.listSessions();
      if (!signal?.aborted) {
        setSessions(res.sessions || []);
      }
    } catch (err) {
      if (!signal?.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to load sessions');
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [client]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchSessions(controller.signal);
    return () => {
      controller.abort();
    };
  }, [activeConnectionId, activeProfile, fetchSessions]);

  const filteredSessions = sessions
    .filter((s) => (s.title ?? '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.last_active ?? b.started_at ?? 0) - (a.last_active ?? a.started_at ?? 0));

  // Load history into the chat store slice for the given session.
  // Idempotent: only loads if the slice is empty (so we don't clobber a live session).
  const loadSessionHistory = useCallback(async (sessionId: string) => {
    if (!client) return;
    ensureSession(sessionId);
    const slice = useChatStore.getState().sessions[sessionId];
    if (slice && slice.messages.length > 0) return; // already populated

    try {
      const res = await client.getSessionHistory(sessionId);
      if (res.messages && res.messages.length > 0) {
        for (const msg of res.messages) {
          const message: Message = {
            id: `hist_${sessionId}_${Math.random().toString(36).slice(2, 9)}`,
            role: msg.role === 'tool' ? 'tool' : msg.role === 'system' ? 'system' : msg.role,
            content: msg.content,
            timestamp: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
            toolCalls: parseHistoryToolCalls(msg),
          };
          addMessage(sessionId, message);
        }
      }
    } catch {
      // Ignore — slice may legitimately be a new session that's never run.
    }
  }, [client, ensureSession, addMessage]);

  const handleNewChat = useCallback(() => {
    const sid = generateSessionId();
    ensureSession(sid);
    assignToFocused(sid);
    onNewChat?.();
  }, [ensureSession, assignToFocused, onNewChat]);

  const handleSessionClick = useCallback(async (sessionId: string) => {
    if (!client) return;
    ensureSession(sessionId);
    assignToFocused(sessionId);
    await loadSessionHistory(sessionId);
  }, [client, ensureSession, assignToFocused, loadSessionHistory]);

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => closeContextMenu();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu, closeContextMenu]);

  const handleDelete = useCallback(async (sessionId: string) => {
    closeContextMenu();
    if (!client) return;
    try {
      await client.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      // Tear down the slice and unbind from any panes
      useChatStore.getState().removeSession(sessionId);
      useLayoutStore.getState().closeSessionEverywhere(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    }
  }, [client, closeContextMenu]);

  const handleContinue = useCallback(async (sessionId: string) => {
    closeContextMenu();
    if (!client) return;
    ensureSession(sessionId);
    assignToFocused(sessionId);
    await loadSessionHistory(sessionId);
  }, [client, ensureSession, assignToFocused, closeContextMenu, loadSessionHistory]);

  const handleRename = useCallback((sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      setRenamingId(sessionId);
      setRenameValue(session.title ?? '');
    }
    closeContextMenu();
  }, [sessions, closeContextMenu]);

  const handleRenameSubmit = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      setSessions((prev) =>
        prev.map((s) => (s.id === renamingId ? { ...s, title: renameValue.trim() } : s))
      );
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue]);

  const handleRefresh = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="p-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewChat}
            disabled={!activeConnectionId}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-zinc-950 font-medium text-sm hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 1v12M1 7h12" />
            </svg>
            New Chat
          </button>
          <button
            onClick={handleRefresh}
            disabled={!activeConnectionId || isLoading}
            className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            title="Refresh sessions"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={isLoading ? 'animate-spin' : ''}
            >
              <path d="M1 8a7 7 0 0 1 13-3.5M15 8a7 7 0 0 1-13 3.5" />
              <path d="M14 1v4h-4M2 15v-4h4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-3 pb-2 shrink-0">
        <div className="relative">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none transition-colors duration-150"
          />
        </div>
      </div>

      {error && (
        <div className="px-3 pb-2 shrink-0">
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading && sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-600 text-sm">
            <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mb-2" />
            Loading sessions...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-600 text-sm">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-2 text-zinc-700">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {search ? 'No matching sessions' : 'No sessions yet'}
          </div>
        ) : (
          filteredSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={focusedSessionId === session.id}
              isRenaming={renamingId === session.id}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameSubmit={handleRenameSubmit}
              onContextMenu={handleContextMenu}
              onClick={handleSessionClick}
            />
          ))
        )}
      </div>

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="context-menu-item" onClick={() => handleRename(contextMenu.sessionId)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
            </svg>
            Rename
          </div>
          <div className="context-menu-item" onClick={() => handleContinue(contextMenu.sessionId)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 3v4c0 1.1.9 2 2 2h4M2 3v10" />
            </svg>
            Open in focused pane
          </div>
          <div className="context-menu-item danger" onClick={() => handleDelete(contextMenu.sessionId)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" />
            </svg>
            Delete
          </div>
        </div>
      )}
    </div>
  );
}
