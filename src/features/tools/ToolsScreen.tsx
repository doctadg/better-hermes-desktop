/**
 * ToolsScreen — top-level Tools navigation entry point.
 *
 * Two top tabs:
 *   - Toolsets: built-in toolsets exposed by the Hermes server (read +
 *     toggle).
 *   - MCP Servers: locally-stored Model Context Protocol server registry
 *     (CRUD).
 *
 * Replaces the legacy `src/components/screens/ToolsScreen.tsx`. The nav
 * wiring is described in INTEGRATION.md.
 */

import { useState } from 'react';
import { Server, Wrench } from 'lucide-react';
import { ToolsetsTab } from './ToolsetsTab';
import { McpServersTab } from './McpServersTab';

type TabId = 'toolsets' | 'mcp';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'toolsets', label: 'Toolsets', icon: <Wrench size={14} /> },
  { id: 'mcp', label: 'MCP Servers', icon: <Server size={14} /> },
];

export function ToolsScreen(): React.JSX.Element {
  const [tab, setTab] = useState<TabId>('toolsets');

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {/* Header w/ tab switcher */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Tools</h2>
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 flex items-center gap-1.5 ${
                tab === t.id
                  ? 'bg-zinc-800 text-amber-400 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body — the active tab owns its own scroll area. */}
      <div className="flex-1 min-h-0">
        {tab === 'toolsets' ? <ToolsetsTab /> : <McpServersTab />}
      </div>
    </div>
  );
}

export default ToolsScreen;
