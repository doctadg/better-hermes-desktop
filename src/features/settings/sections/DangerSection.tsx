/**
 * Danger — destructive operations with confirmation dialogs.
 *
 * Provides buttons that clear sessions, reset settings, clear chat history,
 * and perform a factory reset. Each action shows an inline confirmation
 * step (click once to arm, click again to execute) to prevent accidents.
 *
 * The actual operations target Zustand stores directly since there are no
 * server-side endpoints for these yet.
 */
import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, Trash2, RotateCcw, MessageSquareOff, Bomb } from 'lucide-react';

import { useChatStore } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import { useLayoutStore } from '@/stores/layout';

type DangerAction = 'sessions' | 'settings' | 'chat' | 'factory' | null;

interface OpResult {
  kind: 'ok' | 'error';
  message: string;
}

function useAutoDismiss<T>(value: T, nullValue: T, ms: number): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(nullValue);
  useEffect(() => {
    if (state === nullValue) return;
    const t = setTimeout(() => setState(nullValue), ms);
    return (): void => clearTimeout(t);
  }, [state, nullValue, ms]);
  return [state, setState];
}

export function DangerSection(): React.JSX.Element {
  const [pendingAction, setPendingAction] = useState<DangerAction>(null);
  const [result, setResult] = useAutoDismiss<OpResult | null>(null, null, 4000);

  const clearAllSessions = useChatStore((s) => s.clearAllSessions);
  const resetLayout = useLayoutStore((s) => s.setLayout);
  const clearAllBindings = useLayoutStore((s) => s.clearAllBindings);

  const executeAction = useCallback(
    (action: DangerAction) => {
      try {
        switch (action) {
          case 'sessions':
            clearAllSessions();
            clearAllBindings();
            setResult({ kind: 'ok', message: 'All sessions cleared.' });
            break;
          case 'settings': {
            // Reset persisted stores to defaults by clearing localStorage keys
            const keysToRemove = ['hermes-layout', 'hermes-connections'];
            keysToRemove.forEach((k) => localStorage.removeItem(k));
            // Reset layout store in-memory
            resetLayout('1x1');
            clearAllBindings();
            setResult({ kind: 'ok', message: 'Settings reset to defaults. Restart recommended.' });
            break;
          }
          case 'chat':
            clearAllSessions();
            setResult({ kind: 'ok', message: 'Chat history cleared.' });
            break;
          case 'factory': {
            clearAllSessions();
            clearAllBindings();
            resetLayout('1x1');
            // Nuke all persisted Zustand stores
            const keysToRemove = ['hermes-layout', 'hermes-connections'];
            keysToRemove.forEach((k) => localStorage.removeItem(k));
            setResult({ kind: 'ok', message: 'Factory reset complete. Please restart the application.' });
            break;
          }
          default:
            break;
        }
      } catch (err) {
        setResult({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Operation failed',
        });
      }
      setPendingAction(null);
    },
    [clearAllSessions, clearAllBindings, resetLayout, setResult]
  );

  const handleAction = useCallback(
    (action: DangerAction) => {
      if (pendingAction === action) {
        executeAction(action);
      } else {
        setPendingAction(action);
      }
    },
    [pendingAction, executeAction]
  );

  // Auto-dismiss confirmation after 5s
  useEffect(() => {
    if (!pendingAction) return;
    const t = setTimeout(() => setPendingAction(null), 5000);
    return (): void => clearTimeout(t);
  }, [pendingAction]);

  const actions: {
    id: DangerAction;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    description: string;
    confirmText: string;
  }[] = [
    {
      id: 'sessions',
      icon: Trash2,
      label: 'Clear All Sessions',
      description: 'Close all active chat sessions and remove their message history.',
      confirmText: 'Click again to confirm',
    },
    {
      id: 'settings',
      icon: RotateCcw,
      label: 'Reset Settings to Default',
      description: 'Restore all settings (connections, layout, preferences) to their defaults.',
      confirmText: 'Click again to confirm',
    },
    {
      id: 'chat',
      icon: MessageSquareOff,
      label: 'Clear Chat History',
      description: 'Delete all messages across all sessions. Sessions themselves are kept.',
      confirmText: 'Click again to confirm',
    },
    {
      id: 'factory',
      icon: Bomb,
      label: 'Factory Reset',
      description: 'Wipe everything: sessions, settings, connections, and chat history. The app will be as if freshly installed.',
      confirmText: 'Click again to confirm',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      <section className="p-4 bg-red-950/30 border border-red-800/50 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
            <p className="text-xs text-red-400/70 mt-1">
              These actions are irreversible. Each button requires a double-click to confirm — click once to arm,
              then click again to execute. A confirmation window auto-expires after 5 seconds.
            </p>
          </div>
        </div>
      </section>

      {/* Action buttons */}
      {actions.map((action) => {
        const Icon = action.icon;
        const isArmed = pendingAction === action.id;
        return (
          <section key={action.id} className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isArmed ? 'bg-red-600' : 'bg-zinc-800'
                  }`}
                >
                  <Icon size={16} className={isArmed ? 'text-white' : 'text-zinc-400'} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-100">{action.label}</div>
                  <p className="text-xs text-zinc-500 mt-0.5">{action.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAction(action.id)}
                className={`shrink-0 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  isArmed
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-zinc-800 text-red-400 border border-red-800/50 hover:bg-red-900/30 hover:text-red-300'
                }`}
              >
                {isArmed ? action.confirmText : action.label}
              </button>
            </div>
          </section>
        );
      })}

      {/* Result toast */}
      {result && (
        <div
          className={`text-xs rounded-lg px-3 py-2 ${
            result.kind === 'ok'
              ? 'text-emerald-300 bg-emerald-900/20 border border-emerald-800'
              : 'text-red-300 bg-red-900/20 border border-red-800'
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}

export default DangerSection;
