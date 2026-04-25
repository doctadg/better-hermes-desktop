/**
 * Hermes Desktop - Layout Store
 * Manages the multi-pane grid: which layout (1x1/2x1/2x2), which session
 * is bound to each pane, and which pane is focused.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Layout = '1x1' | '2x1' | '2x2';

export interface Pane {
  id: string;
  sessionId: string | null;
}

const PANE_COUNT: Record<Layout, number> = {
  '1x1': 1,
  '2x1': 2,
  '2x2': 4,
};

interface LayoutState {
  layout: Layout;
  panes: Pane[];
  focusedPaneId: string | null;

  setLayout: (layout: Layout) => void;
  setPaneSession: (paneId: string, sessionId: string | null) => void;
  focusPane: (paneId: string) => void;
  assignToFocused: (sessionId: string) => void;
  closeSessionEverywhere: (sessionId: string) => void;
  clearAllBindings: () => void;
  getFocusedSessionId: () => string | null;
  getOpenSessionIds: () => string[];
}

function paneId(index: number): string {
  return `pane_${index}`;
}

function buildPanes(layout: Layout, prev: Pane[] = []): Pane[] {
  const count = PANE_COUNT[layout];
  return Array.from({ length: count }, (_, i) => {
    const existing = prev[i];
    return {
      id: paneId(i),
      sessionId: existing?.sessionId ?? null,
    };
  });
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      layout: '1x1',
      panes: buildPanes('1x1'),
      focusedPaneId: paneId(0),

      setLayout: (layout) => {
        set((state) => {
          const panes = buildPanes(layout, state.panes);
          // If the focused pane was dropped, focus the first one
          const focused =
            state.focusedPaneId && panes.some((p) => p.id === state.focusedPaneId)
              ? state.focusedPaneId
              : panes[0]?.id ?? null;
          return { layout, panes, focusedPaneId: focused };
        });
      },

      setPaneSession: (paneId, sessionId) => {
        set((state) => ({
          panes: state.panes.map((p) =>
            p.id === paneId ? { ...p, sessionId } : p
          ),
        }));
      },

      focusPane: (paneId) => {
        set((state) =>
          state.panes.some((p) => p.id === paneId)
            ? { focusedPaneId: paneId }
            : state
        );
      },

      assignToFocused: (sessionId) => {
        set((state) => {
          const target = state.focusedPaneId ?? state.panes[0]?.id;
          if (!target) return state;
          return {
            panes: state.panes.map((p) =>
              p.id === target ? { ...p, sessionId } : p
            ),
          };
        });
      },

      closeSessionEverywhere: (sessionId) => {
        set((state) => ({
          panes: state.panes.map((p) =>
            p.sessionId === sessionId ? { ...p, sessionId: null } : p
          ),
        }));
      },

      clearAllBindings: () => {
        set((state) => ({
          panes: state.panes.map((p) => ({ ...p, sessionId: null })),
        }));
      },

      getFocusedSessionId: () => {
        const { panes, focusedPaneId } = get();
        return panes.find((p) => p.id === focusedPaneId)?.sessionId ?? null;
      },

      getOpenSessionIds: () => {
        const { panes } = get();
        const set = new Set<string>();
        for (const p of panes) {
          if (p.sessionId) set.add(p.sessionId);
        }
        return Array.from(set);
      },
    }),
    {
      name: 'hermes-layout',
      partialize: (state) => ({
        layout: state.layout,
        panes: state.panes,
        focusedPaneId: state.focusedPaneId,
      }),
    }
  )
);
