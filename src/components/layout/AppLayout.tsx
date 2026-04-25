import { useCallback, useRef, useState, useEffect, type ReactNode } from 'react';

interface AppLayoutProps {
  sidebarVisible: boolean;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  contextVisible: boolean;
  contextWidth: number;
  onContextWidthChange: (width: number) => void;
  sidebar: ReactNode;
  chat: ReactNode;
  context: ReactNode;
}

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;
const MIN_CONTEXT_WIDTH = 260;
const MAX_CONTEXT_WIDTH = 480;

export function AppLayout({
  sidebarVisible,
  sidebarWidth,
  onSidebarWidthChange,
  contextVisible,
  contextWidth,
  onContextWidthChange,
  sidebar,
  chat,
  context,
}: AppLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<'sidebar' | 'context' | null>(null);

  const startSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing('sidebar');
  }, []);

  const startContextResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing('context');
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();

      if (resizing === 'sidebar') {
        const newWidth = Math.round(e.clientX - containerRect.left);
        onSidebarWidthChange(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newWidth)));
      } else if (resizing === 'context') {
        const newWidth = Math.round(containerRect.right - e.clientX);
        onContextWidthChange(Math.max(MIN_CONTEXT_WIDTH, Math.min(MAX_CONTEXT_WIDTH, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing, onSidebarWidthChange, onContextWidthChange]);

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      {sidebarVisible && (
        <>
          <div
            className="shrink-0 overflow-hidden border-r border-zinc-800 bg-zinc-950 transition-[width] duration-100 ease-out"
            style={{ width: sidebarWidth }}
          >
            {sidebar}
          </div>
          <div
            className={`resize-handle resize-handle-left shrink-0 hover:bg-amber-500/20 active:bg-amber-500/30 ${
              resizing === 'sidebar' ? 'bg-amber-500/40' : ''
            }`}
            onMouseDown={startSidebarResize}
          />
        </>
      )}

      {/* Chat area */}
      <div className="flex-1 min-w-0 overflow-hidden bg-zinc-950">
        {chat}
      </div>

      {/* Context panel */}
      {contextVisible && (
        <>
          <div
            className={`resize-handle resize-handle-right shrink-0 hover:bg-amber-500/20 active:bg-amber-500/30 ${
              resizing === 'context' ? 'bg-amber-500/40' : ''
            }`}
            onMouseDown={startContextResize}
          />
          <div
            className="shrink-0 overflow-hidden border-l border-zinc-800 bg-zinc-950 transition-[width] duration-100 ease-out"
            style={{ width: contextWidth }}
          >
            {context}
          </div>
        </>
      )}
    </div>
  );
}
