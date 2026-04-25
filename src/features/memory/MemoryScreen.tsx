/**
 * MemoryScreen (feature 1E) — multi-tab memory editor.
 *
 * Tabs:
 *   - Entries   → MEMORY.md split into per-entry textareas
 *   - Profile   → USER.md single textarea with debounced auto-save
 *   - Providers → catalogue of pluggable long-term memory providers
 *
 * The header lives inside each tab so the per-tab capacity bar and status
 * line can react to that tab's content.
 */

import { useState } from 'react';
import { Brain, User, ExternalLink } from 'lucide-react';
import { EntriesTab } from './EntriesTab';
import { ProfileTab } from './ProfileTab';
import { ProvidersTab } from './ProvidersTab';

type MemoryTabId = 'entries' | 'profile' | 'providers';

interface TabDef {
  id: MemoryTabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'entries', label: 'Entries', icon: <Brain size={13} /> },
  { id: 'profile', label: 'Profile', icon: <User size={13} /> },
  { id: 'providers', label: 'Providers', icon: <ExternalLink size={13} /> },
];

export function MemoryScreen() {
  const [tab, setTab] = useState<MemoryTabId>('entries');

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {/* Top tabs */}
      <div className="shrink-0 border-b border-zinc-800 px-4 pt-3">
        <div className="flex gap-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors duration-150 ${
                  active
                    ? 'bg-zinc-900 text-amber-400 border border-zinc-800 border-b-zinc-900 -mb-px'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'entries' && <EntriesTab />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'providers' && <ProvidersTab />}
      </div>
    </div>
  );
}
