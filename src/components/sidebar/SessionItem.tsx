import { useRef, useEffect, memo } from 'react';
import type { Session } from '@/api/types';
import { useSessionIsStreaming } from '@/stores/chat';

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onContextMenu: (e: React.MouseEvent, sessionId: string) => void;
  onClick: (sessionId: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function SessionItemInner({
  session,
  isActive,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onContextMenu,
  onClick,
}: SessionItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isStreaming = useSessionIsStreaming(session.id);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onRenameSubmit();
    if (e.key === 'Escape') onRenameSubmit();
  };

  return (
    <div
      onClick={() => onClick(session.id)}
      onContextMenu={(e) => onContextMenu(e, session.id)}
      draggable={!isRenaming}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-hermes-session-id', session.id);
      }}
      className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors duration-150 mb-0.5 ${
        isActive
          ? 'bg-zinc-800/80 border border-amber-500/30'
          : 'hover:bg-zinc-800/50 border border-transparent'
      }`}
    >
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameSubmit}
            onKeyDown={handleKeyDown}
            className="w-full px-1.5 py-0.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100 outline-none focus:border-amber-500"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            {isStreaming && (
              <span
                className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse-amber"
                title="Streaming"
              />
            )}
            <span className="text-sm font-medium text-zinc-200 truncate">{session.title ?? 'Untitled'}</span>
          </div>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-zinc-500 truncate flex-1">
            {session.message_count} messages
          </span>
          <span className="text-xs text-zinc-600 shrink-0">
            {formatRelativeTime(session.last_active * 1000)}
          </span>
        </div>
        {session.model && (
          <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] bg-zinc-700 text-zinc-400 rounded">
            {session.model}
          </span>
        )}
      </div>
    </div>
  );
}

export const SessionItem = memo(SessionItemInner);
