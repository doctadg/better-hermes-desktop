import { useCallback, useState, memo } from 'react';
import { useLayoutStore, type Layout } from '@/stores/layout';
import { useChatStore, useSessionIsStreaming } from '@/stores/chat';

/**
 * Pane HUD — a compact mini-map of the current pane layout in the topbar.
 *
 * Shows each pane as a tile sized to match the layout (1×1, 2×1, 2×2). Tiles
 * reflect live state:
 *   • empty pane = dashed outline
 *   • idle session = solid fill
 *   • streaming = pulsing amber dot
 *   • focused pane = thin zinc-300 border
 *
 * Click a tile to focus that pane. Drop a session pill (drag from the
 * sidebar) onto a tile to assign it. Right-click the HUD body to switch
 * the overall layout (1x1 / 2x1 / 2x2).
 */
export function PaneHud() {
  const layout = useLayoutStore((s) => s.layout);
  const panes = useLayoutStore((s) => s.panes);
  const focusedPaneId = useLayoutStore((s) => s.focusedPaneId);
  const setLayout = useLayoutStore((s) => s.setLayout);
  const setPaneSession = useLayoutStore((s) => s.setPaneSession);
  const focusPane = useLayoutStore((s) => s.focusPane);
  const ensureSession = useChatStore((s) => s.ensureSession);

  const [dragOverPane, setDragOverPane] = useState<string | null>(null);

  const handleClickPane = useCallback(
    (paneId: string) => {
      focusPane(paneId);
    },
    [focusPane]
  );

  const handleDragOver = useCallback((e: React.DragEvent, paneId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPane(paneId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverPane(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, paneId: string) => {
      e.preventDefault();
      setDragOverPane(null);
      const sid = e.dataTransfer.getData('text/x-hermes-session-id');
      if (!sid) return;
      ensureSession(sid);
      setPaneSession(paneId, sid);
      focusPane(paneId);
    },
    [ensureSession, setPaneSession, focusPane]
  );

  // The HUD displays pane tiles in a mini-grid. Outer wrapper is fixed-size,
  // inner cells use CSS grid that mirrors the actual layout.
  const innerGridClass =
    layout === '1x1'
      ? 'grid-cols-1 grid-rows-1'
      : layout === '2x1'
        ? 'grid-cols-2 grid-rows-1'
        : 'grid-cols-2 grid-rows-2';

  return (
    <div className="flex items-center gap-2 no-drag">
      <LayoutSwitcher current={layout} onChange={setLayout} />
      <div
        className={`grid ${innerGridClass} gap-0.5 w-12 h-7 p-0.5 rounded-md bg-zinc-900 border border-zinc-800`}
        title="Pane layout — click a cell to focus, drag a session here to assign"
      >
        {panes.map((pane) => (
          <HudCell
            key={pane.id}
            paneId={pane.id}
            sessionId={pane.sessionId}
            isFocused={pane.id === focusedPaneId}
            isOver={dragOverPane === pane.id}
            onClick={() => handleClickPane(pane.id)}
            onDragOver={(e) => handleDragOver(e, pane.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, pane.id)}
          />
        ))}
      </div>
    </div>
  );
}

const HudCell = memo(function HudCell({
  paneId: _paneId,
  sessionId,
  isFocused,
  isOver,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  paneId: string;
  sessionId: string | null;
  isFocused: boolean;
  isOver: boolean;
  onClick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const isStreaming = useSessionIsStreaming(sessionId);
  const isEmpty = !sessionId;

  return (
    <button
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative rounded-sm transition-colors duration-150 ${
        isOver
          ? 'bg-amber-500/30 border border-amber-500/60'
          : isFocused
            ? 'bg-zinc-700 border border-zinc-300/50'
            : isEmpty
              ? 'bg-zinc-950 border border-dashed border-zinc-700'
              : 'bg-zinc-800 border border-zinc-700 hover:border-zinc-600'
      }`}
      title={
        sessionId
          ? `${sessionId.slice(0, 8)}${isStreaming ? ' (streaming)' : ''}`
          : 'Empty pane'
      }
    >
      {isStreaming && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse-amber" />
        </span>
      )}
    </button>
  );
});

function LayoutSwitcher({
  current,
  onChange,
}: {
  current: Layout;
  onChange: (layout: Layout) => void;
}) {
  const options: { id: Layout; label: string; icon: React.ReactNode }[] = [
    {
      id: '1x1',
      label: 'Single pane',
      icon: (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
        </svg>
      ),
    },
    {
      id: '2x1',
      label: 'Side-by-side',
      icon: (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1.5" y="1.5" width="4" height="9" rx="0.5" />
          <rect x="6.5" y="1.5" width="4" height="9" rx="0.5" />
        </svg>
      ),
    },
    {
      id: '2x2',
      label: 'Quad',
      icon: (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1.5" y="1.5" width="4" height="4" rx="0.5" />
          <rect x="6.5" y="1.5" width="4" height="4" rx="0.5" />
          <rect x="1.5" y="6.5" width="4" height="4" rx="0.5" />
          <rect x="6.5" y="6.5" width="4" height="4" rx="0.5" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-zinc-900 border border-zinc-800">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`p-1 rounded transition-colors duration-150 ${
            current === opt.id
              ? 'bg-zinc-800 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
          }`}
          title={opt.label}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
