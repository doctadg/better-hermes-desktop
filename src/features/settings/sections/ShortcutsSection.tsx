/**
 * Shortcuts — keyboard shortcuts reference.
 *
 * Displays a grouped table of available keyboard shortcuts with kbd-styled
 * key combos. Pulled from the existing shortcuts defined in the legacy
 * SettingsScreen and expanded into categories.
 *
 * NOTE: Shortcuts are not yet customizable — that will come in a future
 * version with a configurable keymap store.
 */
import { Keyboard } from 'lucide-react';

interface Shortcut {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  category: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Navigation',
    shortcuts: [
      { keys: 'Ctrl+B', description: 'Toggle session sidebar' },
      { keys: 'Ctrl+Shift+P', description: 'Toggle context panel' },
      { keys: 'Ctrl+1 … 4', description: 'Switch between panes' },
      { keys: 'Ctrl+Tab', description: 'Cycle open sessions' },
    ],
  },
  {
    category: 'Chat',
    shortcuts: [
      { keys: 'Enter', description: 'Send message' },
      { keys: 'Shift+Enter', description: 'New line in input' },
      { keys: 'Ctrl+L', description: 'Clear current chat' },
      { keys: 'Ctrl+N', description: 'New session' },
    ],
  },
  {
    category: 'Editor',
    shortcuts: [
      { keys: 'Ctrl+Z', description: 'Undo' },
      { keys: 'Ctrl+Shift+Z', description: 'Redo' },
      { keys: 'Ctrl+A', description: 'Select all' },
      { keys: 'Ctrl+C', description: 'Copy selection' },
      { keys: 'Ctrl+V', description: 'Paste' },
    ],
  },
  {
    category: 'General',
    shortcuts: [
      { keys: 'Escape', description: 'Close dialog / cancel' },
      { keys: 'Ctrl+,', description: 'Open settings' },
      { keys: 'Ctrl+Q', description: 'Quit application' },
      { keys: 'F11', description: 'Toggle fullscreen' },
      { keys: 'Ctrl+Shift+I', description: 'Toggle developer tools' },
    ],
  },
];

function Kbd({ children }: { children: string }): React.JSX.Element {
  const keys = children.split('+');
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key, i) => (
        <kbd
          key={`${key}-${i}`}
          className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-300 font-mono"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutsSection(): React.JSX.Element {
  return (
    <div className="space-y-4">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.category} className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
          <h3 className="text-sm font-semibold text-zinc-200">{group.category}</h3>
          <div className="space-y-1">
            {group.shortcuts.map((s) => (
              <div
                key={s.keys}
                className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
              >
                <span className="text-zinc-400">{s.description}</span>
                <Kbd>{s.keys}</Kbd>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Customization note */}
      <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="flex items-center gap-2">
          <Keyboard size={14} className="text-zinc-500" />
          <p className="text-xs text-zinc-500">
            Shortcuts can be customized in a future version. The defaults follow standard desktop conventions.
          </p>
        </div>
      </section>
    </div>
  );
}

export default ShortcutsSection;
