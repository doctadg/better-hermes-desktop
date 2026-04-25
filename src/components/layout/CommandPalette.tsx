import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useChatStore, generateSessionId } from '@/stores/chat';
import { useLayoutStore, type Layout } from '@/stores/layout';
import { useConnectionStore } from '@/stores/connection';
import type { Session } from '@/api/types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/**
 * ⌘K command palette. Two-step flow:
 *   1. Pick a target pane (1, 2, 3, 4 — number keys or click)
 *   2. Pick a session to assign (fuzzy filtered list, ↵ to confirm)
 *
 * Or "New Chat" to spawn a fresh session in the focused pane.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const layout = useLayoutStore((s) => s.layout);
  const panes = useLayoutStore((s) => s.panes);
  const focusedPaneId = useLayoutStore((s) => s.focusedPaneId);
  const setLayout = useLayoutStore((s) => s.setLayout);
  const setPaneSession = useLayoutStore((s) => s.setPaneSession);
  const focusPane = useLayoutStore((s) => s.focusPane);

  const sessions = useChatStore((s) => s.sessions);
  const ensureSession = useChatStore((s) => s.ensureSession);

  const client = useConnectionStore((s) => s.client);

  const [query, setQuery] = useState('');
  const [serverSessions, setServerSessions] = useState<Session[]>([]);
  const [targetPaneId, setTargetPaneId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state on open and focus the input
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTargetPaneId(focusedPaneId);
      // Defer focus a tick so the modal is mounted
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, focusedPaneId]);

  // Pull sessions list from server when opened
  useEffect(() => {
    if (!open || !client) return;
    let cancelled = false;
    client.listSessions().then((res) => {
      if (!cancelled) setServerSessions(res.sessions || []);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, client]);

  const items = useMemo(() => {
    const merged = new Map<string, { id: string; title: string; isLocal: boolean; isStreaming: boolean }>();

    // Local sessions (already streaming or in store)
    for (const sid of Object.keys(sessions)) {
      const slice = sessions[sid];
      merged.set(sid, {
        id: sid,
        title: sid,
        isLocal: true,
        isStreaming: slice.isStreaming,
      });
    }
    // Server-known sessions
    for (const s of serverSessions) {
      const existing = merged.get(s.id);
      merged.set(s.id, {
        id: s.id,
        title: s.title || s.id,
        isLocal: existing?.isLocal ?? false,
        isStreaming: existing?.isStreaming ?? false,
      });
    }

    const arr = Array.from(merged.values());
    const q = query.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter((it) => it.title.toLowerCase().includes(q) || it.id.toLowerCase().includes(q));
  }, [sessions, serverSessions, query]);

  const handleAssign = useCallback(
    (sessionId: string) => {
      const target = targetPaneId ?? focusedPaneId ?? panes[0]?.id ?? null;
      if (!target) return;
      ensureSession(sessionId);
      setPaneSession(target, sessionId);
      focusPane(target);
      onClose();
    },
    [targetPaneId, focusedPaneId, panes, ensureSession, setPaneSession, focusPane, onClose]
  );

  const handleNewChat = useCallback(() => {
    const sid = generateSessionId();
    handleAssign(sid);
  }, [handleAssign]);

  // Keyboard: Esc closes, ↑/↓ move, ↵ activates, 1-4 retarget pane
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(items.length, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex === 0) {
          handleNewChat();
        } else {
          const item = items[activeIndex - 1];
          if (item) handleAssign(item.id);
        }
        return;
      }
      // Number keys 1-4 retarget the destination pane
      if (e.key >= '1' && e.key <= '4' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        const pane = panes[idx];
        if (pane) setTargetPaneId(pane.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, items, activeIndex, onClose, handleNewChat, handleAssign, panes]);

  if (!open) return null;

  const targetPane = panes.find((p) => p.id === targetPaneId);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-32 px-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Layout selector + target pane row */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500">Target</span>
            {panes.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setTargetPaneId(p.id)}
                className={`min-w-[22px] px-1.5 py-0.5 rounded font-mono text-[10px] transition-colors duration-150 ${
                  p.id === (targetPaneId ?? focusedPaneId)
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'bg-zinc-800/60 text-zinc-500 hover:text-zinc-300'
                }`}
                title={p.sessionId ? p.sessionId.slice(0, 8) : 'Empty'}
              >
                {i + 1}
              </button>
            ))}
            {targetPane?.sessionId && (
              <span className="ml-2 text-zinc-500 font-mono">
                → {targetPane.sessionId.slice(0, 8)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {(['1x1', '2x1', '2x2'] as Layout[]).map((l) => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] transition-colors duration-150 ${
                  layout === l
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'bg-zinc-800/60 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Search input */}
        <div className="px-3 py-2 border-b border-zinc-800">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search sessions or type / for a new chat..."
            className="w-full px-2 py-1.5 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
          />
        </div>

        {/* Item list */}
        <div className="max-h-80 overflow-y-auto py-1">
          <PaletteRow
            label="New chat"
            sublabel="Spawn a fresh session in the target pane"
            isActive={activeIndex === 0}
            onClick={handleNewChat}
            icon={
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 1v12M1 7h12" />
              </svg>
            }
          />
          {items.map((item, i) => (
            <PaletteRow
              key={item.id}
              label={item.title === item.id ? `Session ${item.id.slice(0, 8)}` : item.title}
              sublabel={item.id}
              isActive={activeIndex === i + 1}
              isStreaming={item.isStreaming}
              onClick={() => handleAssign(item.id)}
              icon={
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 2h12v9H5l-3 3v-3H2V2z" />
                </svg>
              }
            />
          ))}
          {items.length === 0 && query && (
            <div className="px-4 py-3 text-xs text-zinc-600">No matches.</div>
          )}
        </div>

        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-zinc-800 bg-zinc-900/40 text-[10px] text-zinc-500">
          <kbd className="px-1 rounded bg-zinc-800 border border-zinc-700">↑↓</kbd> navigate
          <kbd className="px-1 rounded bg-zinc-800 border border-zinc-700">↵</kbd> assign
          <kbd className="px-1 rounded bg-zinc-800 border border-zinc-700">⌘1–4</kbd> retarget pane
          <kbd className="px-1 rounded bg-zinc-800 border border-zinc-700">esc</kbd> close
        </div>
      </div>
    </div>
  );
}

function PaletteRow({
  label,
  sublabel,
  icon,
  isActive,
  isStreaming,
  onClick,
}: {
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  isActive: boolean;
  isStreaming?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => {/* hover focus could be wired to setActiveIndex if needed */}}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors duration-150 ${
        isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900'
      }`}
    >
      <span className={`shrink-0 ${isActive ? 'text-amber-400' : 'text-zinc-500'}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse-amber shrink-0" />}
          <span className="text-sm truncate">{label}</span>
        </div>
        {sublabel && (
          <div className="text-[10px] text-zinc-600 font-mono truncate">{sublabel}</div>
        )}
      </div>
    </button>
  );
}
