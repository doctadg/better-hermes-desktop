import { useEffect } from 'react';
import { useLayoutStore } from '@/stores/layout';
import { Pane } from './Pane';
import { useAltReveal } from '@/hooks/useAltReveal';

/**
 * Multi-pane chat surface. Renders 1, 2, or 4 panes depending on the layout.
 * Layout switching preserves session→pane bindings where possible.
 *
 * Keyboard:
 *   ⌘1 / ⌘2 / ⌘3 / ⌘4 — focus pane N
 *   Hold Alt — overlay numeric pane badges (so the shortcut targets are obvious)
 */
export function PaneGrid() {
  const layout = useLayoutStore((s) => s.layout);
  const panes = useLayoutStore((s) => s.panes);
  const focusedPaneId = useLayoutStore((s) => s.focusedPaneId);
  const focusPane = useLayoutStore((s) => s.focusPane);
  const altHeld = useAltReveal();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key < '1' || e.key > '4') return;
      const idx = parseInt(e.key, 10) - 1;
      const pane = useLayoutStore.getState().panes[idx];
      if (pane) {
        e.preventDefault();
        focusPane(pane.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusPane]);

  const gridClass =
    layout === '1x1'
      ? 'grid-cols-1 grid-rows-1'
      : layout === '2x1'
        ? 'grid-cols-2 grid-rows-1'
        : 'grid-cols-2 grid-rows-2';

  const showBadges = altHeld && layout !== '1x1';

  return (
    <div className={`grid ${gridClass} gap-px h-full bg-zinc-800/40 relative`}>
      {panes.map((pane, idx) => (
        <div key={pane.id} className="relative min-h-0">
          <Pane
            paneId={pane.id}
            sessionId={pane.sessionId}
            isFocused={pane.id === focusedPaneId}
          />
          {showBadges && (
            <div className="pointer-events-none absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-zinc-900/90 border border-zinc-700 text-[10px] font-mono text-zinc-200 shadow-lg backdrop-blur-sm">
              ⌘{idx + 1}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
