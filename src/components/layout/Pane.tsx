import { useCallback, memo, useState } from 'react';
import { ChatView } from '@/components/chat/ChatView';
import {
  useChatStore,
  useSessionIsStreaming,
  useSessionStatusKind,
} from '@/stores/chat';
import { useLayoutStore } from '@/stores/layout';

interface PaneProps {
  paneId: string;
  sessionId: string | null;
  isFocused: boolean;
}

/**
 * One slot in the PaneGrid. Renders a ChatView bound to its sessionId, with
 * a subtle focused-state treatment (slightly brighter frame + header).
 *
 * Memoized: a streaming token landing in another pane should not re-render
 * this one unless its own sessionId or focus state changed.
 */
function PaneInner({ paneId, sessionId, isFocused }: PaneProps) {
  const focusPane = useLayoutStore((s) => s.focusPane);
  const setPaneSession = useLayoutStore((s) => s.setPaneSession);
  const ensureSession = useChatStore((s) => s.ensureSession);
  const isStreaming = useSessionIsStreaming(sessionId);
  const statusKind = useSessionStatusKind(sessionId);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFocus = useCallback(() => {
    if (!isFocused) focusPane(paneId);
  }, [isFocused, focusPane, paneId]);

  const handleClosePane = useCallback(() => {
    setPaneSession(paneId, null);
  }, [paneId, setPaneSession]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('text/x-hermes-session-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const sid = e.dataTransfer.getData('text/x-hermes-session-id');
      if (!sid) return;
      ensureSession(sid);
      setPaneSession(paneId, sid);
      focusPane(paneId);
    },
    [ensureSession, setPaneSession, focusPane, paneId]
  );

  return (
    <div
      onMouseDownCapture={handleFocus}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex flex-col h-full overflow-hidden bg-zinc-950 border transition-colors duration-150 ${
        isDragOver
          ? 'border-amber-500/60'
          : isFocused
            ? 'border-zinc-600'
            : 'border-zinc-800'
      }`}
    >
      <PaneHeader
        sessionId={sessionId}
        isFocused={isFocused}
        isStreaming={isStreaming}
        statusKind={statusKind}
        onClose={handleClosePane}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatView sessionId={sessionId} />
      </div>
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-amber-500/5">
          <div className="px-3 py-1.5 rounded-md bg-zinc-900 border border-amber-500/40 text-xs text-amber-300">
            Drop to assign
          </div>
        </div>
      )}
    </div>
  );
}

export const Pane = memo(PaneInner);

function PaneHeader({
  sessionId,
  isFocused,
  isStreaming,
  statusKind,
  onClose,
}: {
  sessionId: string | null;
  isFocused: boolean;
  isStreaming: boolean;
  statusKind: string;
  onClose: () => void;
}) {
  const titleColor = isFocused ? 'text-zinc-300' : 'text-zinc-500';
  const labelColor = isFocused ? 'text-zinc-400' : 'text-zinc-600';

  return (
    <div className="shrink-0 h-7 flex items-center justify-between px-2.5 border-b border-zinc-800/80 bg-zinc-950">
      <div className="flex items-center gap-1.5 min-w-0">
        {sessionId ? (
          <>
            {isStreaming ? (
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                  statusKind === 'error' ? 'bg-red-500' : 'bg-amber-500'
                } animate-pulse-amber`}
              />
            ) : (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-zinc-700" />
            )}
            <span className={`text-[10px] font-mono truncate ${titleColor}`} title={sessionId}>
              {sessionId.slice(0, 8)}
            </span>
          </>
        ) : (
          <span className={`text-[10px] uppercase tracking-wider ${labelColor}`}>Empty</span>
        )}
      </div>
      {sessionId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`p-0.5 rounded hover:bg-zinc-800 ${labelColor} hover:text-zinc-200 transition-colors duration-150`}
          title="Unbind session from this pane"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}
