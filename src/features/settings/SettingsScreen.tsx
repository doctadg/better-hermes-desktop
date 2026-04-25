/**
 * Settings — orchestrator screen.
 *
 * Layout: a left rail with one button per section + a right pane that
 * mounts the active section component. Each section is a self-contained
 * leaf component under `./sections/*` so they can be shipped or reordered
 * independently.
 *
 * No global state is owned here — sections read/write directly through
 * `window.hermesAPI` (KV store, models, audit) or zustand stores.
 *
 * NOTE: this component is built to *replace* the existing
 * `src/components/screens/SettingsScreen.tsx`. The old one stays in tree
 * until the parent shell wires us in (see `INTEGRATION.md`).
 */
import { useState, type ComponentType } from 'react';
import {
  Info,
  Plug,
  Palette,
  Network,
  Bot,
  Download,
  FileText,
  Keyboard,
  AlertTriangle,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';

import { AboutSection } from './sections/AboutSection';
import { ConnectionSection } from './sections/ConnectionSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { NetworkSection } from './sections/NetworkSection';
import { DefaultModelSection } from './sections/DefaultModelSection';
import { UpdatesSection } from './sections/UpdatesSection';
import { DataSection } from './sections/DataSection';
import { LogsSection } from './sections/LogsSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { DangerSection } from './sections/DangerSection';

interface SectionDef {
  id: string;
  label: string;
  icon: LucideIcon;
  component: ComponentType;
  /** When true the rail entry is rendered with destructive styling. */
  danger?: boolean;
}

const SECTIONS: readonly SectionDef[] = [
  { id: 'about', label: 'About', icon: Info, component: AboutSection },
  { id: 'connection', label: 'Connections', icon: Plug, component: ConnectionSection },
  { id: 'appearance', label: 'Appearance', icon: Palette, component: AppearanceSection },
  { id: 'network', label: 'Network', icon: Network, component: NetworkSection },
  { id: 'model', label: 'Default Model', icon: Bot, component: DefaultModelSection },
  { id: 'updates', label: 'Updates', icon: Download, component: UpdatesSection },
  { id: 'data', label: 'Data', icon: SettingsIcon, component: DataSection },
  { id: 'logs', label: 'Logs', icon: FileText, component: LogsSection },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, component: ShortcutsSection },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle, component: DangerSection, danger: true },
];

export function SettingsScreen(): React.JSX.Element {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0]!.id);
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0]!;
  const ActiveComponent = active.component;

  return (
    <div className="h-full flex bg-zinc-950 animate-fade-in">
      {/* Left rail */}
      <nav className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-950 overflow-y-auto">
        <div className="px-4 py-4">
          <h1 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Settings</h1>
        </div>
        <ul className="px-2 pb-4 space-y-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = s.id === activeId;
            const isDanger = s.danger === true;
            const base = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-150 text-left';
            const colorClass = isActive
              ? isDanger
                ? 'bg-red-900/30 text-red-300'
                : 'bg-zinc-800 text-zinc-100'
              : isDanger
                ? 'text-red-400/80 hover:bg-zinc-900 hover:text-red-300'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200';
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  className={`${base} ${colorClass}`}
                >
                  <Icon size={14} />
                  <span>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Right pane */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          <header className="mb-6">
            <h2 className="text-xl font-semibold text-zinc-100">{active.label}</h2>
          </header>
          <ActiveComponent />
        </div>
      </main>
    </div>
  );
}

export default SettingsScreen;
