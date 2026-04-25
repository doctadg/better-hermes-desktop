/**
 * Slash command registry.
 *
 * Central catalog of all `/...` commands the chat input recognises.
 * - `kind: 'local'` — handled inside the renderer (no network call).
 * - `kind: 'server'` — forwarded to the backend via `client.dispatchCommand`.
 *
 * Categories are used for grouping in the empty-filter view of the menu and
 * for the colour-coded badge on each row.
 */

import type {
  LucideIcon,
} from 'lucide-react';
import {
  AlertOctagon,
  Bot,
  Bug,
  Check,
  Code as CodeIcon,
  Compass,
  FileText,
  Gauge,
  Globe,
  HardDrive,
  HelpCircle,
  Image as ImageIcon,
  ListChecks,
  MessageSquare,
  Minimize2,
  PauseCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Tag,
  Terminal,
  Trash2,
  Undo2,
  User,
  Wrench,
  Zap,
} from 'lucide-react';

export type SlashCategory = 'chat' | 'agent' | 'tools' | 'info';
export type SlashKind = 'local' | 'server';

export interface SlashCommand {
  /** Stable id (without the leading `/`). */
  id: string;
  /** Display name including leading `/` (e.g. `/help`). */
  name: string;
  /** One-line description shown in the dropdown. */
  description: string;
  /** Grouping category. */
  category: SlashCategory;
  /** Where the command is handled. */
  kind: SlashKind;
  /** Optional hint for the args portion (e.g. `<query>` for `/web`). */
  defaultArgsHint?: string;
  /** Lucide icon used in the dropdown row. */
  icon: LucideIcon;
}

/** Color classes for category badges. Keep in sync with SlashMenu. */
export const CATEGORY_BADGE_CLASS: Record<SlashCategory, string> = {
  chat: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  agent: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  tools: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  info: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

export const CATEGORY_LABEL: Record<SlashCategory, string> = {
  chat: 'Chat',
  agent: 'Agent',
  tools: 'Tools',
  info: 'Info',
};

export const SLASH_COMMANDS: SlashCommand[] = [
  // ─── chat ───
  {
    id: 'new',
    name: '/new',
    description: 'Start a new chat session',
    category: 'chat',
    kind: 'local',
    icon: Plus,
  },
  {
    id: 'clear',
    name: '/clear',
    description: 'Clear the current conversation',
    category: 'chat',
    kind: 'local',
    icon: Trash2,
  },

  // ─── agent ───
  {
    id: 'btw',
    name: '/btw',
    description: 'Ask a side question without affecting context',
    category: 'agent',
    kind: 'server',
    defaultArgsHint: '<question>',
    icon: MessageSquare,
  },
  {
    id: 'approve',
    name: '/approve',
    description: 'Approve the pending action',
    category: 'agent',
    kind: 'server',
    icon: Check,
  },
  {
    id: 'deny',
    name: '/deny',
    description: 'Deny the pending action',
    category: 'agent',
    kind: 'server',
    icon: AlertOctagon,
  },
  {
    id: 'status',
    name: '/status',
    description: 'Show current agent status',
    category: 'agent',
    kind: 'server',
    icon: Gauge,
  },
  {
    id: 'reset',
    name: '/reset',
    description: 'Reset the conversation context',
    category: 'agent',
    kind: 'server',
    icon: RotateCcw,
  },
  {
    id: 'compact',
    name: '/compact',
    description: 'Compact and summarize the conversation',
    category: 'agent',
    kind: 'server',
    icon: Minimize2,
  },
  {
    id: 'undo',
    name: '/undo',
    description: 'Undo the last action',
    category: 'agent',
    kind: 'server',
    icon: Undo2,
  },
  {
    id: 'retry',
    name: '/retry',
    description: 'Retry the last failed action',
    category: 'agent',
    kind: 'server',
    icon: RefreshCw,
  },
  {
    id: 'fast',
    name: '/fast',
    description: 'Toggle priority processing (lower latency)',
    category: 'agent',
    kind: 'server',
    icon: Zap,
  },
  {
    id: 'compress',
    name: '/compress',
    description: 'Compress conversation with optional focus topic',
    category: 'agent',
    kind: 'server',
    defaultArgsHint: '[focus topic]',
    icon: PauseCircle,
  },
  {
    id: 'debug',
    name: '/debug',
    description: 'Show diagnostics and debug info',
    category: 'agent',
    kind: 'server',
    icon: Bug,
  },

  // ─── tools ───
  {
    id: 'web',
    name: '/web',
    description: 'Search the web',
    category: 'tools',
    kind: 'server',
    defaultArgsHint: '<query>',
    icon: Globe,
  },
  {
    id: 'image',
    name: '/image',
    description: 'Generate an image',
    category: 'tools',
    kind: 'server',
    defaultArgsHint: '<prompt>',
    icon: ImageIcon,
  },
  {
    id: 'browse',
    name: '/browse',
    description: 'Browse a URL',
    category: 'tools',
    kind: 'server',
    defaultArgsHint: '<url>',
    icon: Compass,
  },
  {
    id: 'code',
    name: '/code',
    description: 'Write or execute code',
    category: 'tools',
    kind: 'server',
    defaultArgsHint: '<task>',
    icon: CodeIcon,
  },
  {
    id: 'file',
    name: '/file',
    description: 'Read or write files',
    category: 'tools',
    kind: 'server',
    defaultArgsHint: '<path>',
    icon: FileText,
  },
  {
    id: 'shell',
    name: '/shell',
    description: 'Run a shell command',
    category: 'tools',
    kind: 'server',
    defaultArgsHint: '<command>',
    icon: Terminal,
  },

  // ─── info (local-rendered) ───
  {
    id: 'help',
    name: '/help',
    description: 'Show available commands and help',
    category: 'info',
    kind: 'local',
    icon: HelpCircle,
  },
  {
    id: 'tools',
    name: '/tools',
    description: 'List available toolsets',
    category: 'info',
    kind: 'local',
    icon: Wrench,
  },
  {
    id: 'skills',
    name: '/skills',
    description: 'List installed skills',
    category: 'info',
    kind: 'local',
    icon: Sparkles,
  },
  {
    id: 'model',
    name: '/model',
    description: 'Show or switch the current model',
    category: 'info',
    kind: 'local',
    icon: Bot,
  },
  {
    id: 'memory',
    name: '/memory',
    description: 'Preview agent memory',
    category: 'info',
    kind: 'local',
    icon: HardDrive,
  },
  {
    id: 'persona',
    name: '/persona',
    description: 'Show the current persona',
    category: 'info',
    kind: 'local',
    icon: User,
  },
  {
    id: 'version',
    name: '/version',
    description: 'Show Hermes desktop version',
    category: 'info',
    kind: 'local',
    icon: Tag,
  },
  {
    id: 'usage',
    name: '/usage',
    description: 'Show token usage and cost',
    category: 'info',
    kind: 'local',
    icon: ListChecks,
  },
];

// ─── Lookup helpers ───

export function findCommand(idOrName: string): SlashCommand | undefined {
  const normalized = idOrName.startsWith('/')
    ? idOrName.slice(1).toLowerCase()
    : idOrName.toLowerCase();
  return SLASH_COMMANDS.find((c) => c.id === normalized);
}

/**
 * Filter commands by `query` — matches against name and description.
 * `query` may include the leading `/` or not.
 */
export function filterCommands(query: string): SlashCommand[] {
  const trimmed = query.trim();
  if (!trimmed || trimmed === '/') return SLASH_COMMANDS;
  const needle = (trimmed.startsWith('/') ? trimmed.slice(1) : trimmed).toLowerCase();
  return SLASH_COMMANDS.filter(
    (c) =>
      c.id.toLowerCase().startsWith(needle) ||
      c.name.toLowerCase().includes(needle) ||
      c.description.toLowerCase().includes(needle)
  );
}

/** Group commands by category, preserving registry order within each group. */
export function groupByCategory(
  commands: SlashCommand[]
): Array<{ category: SlashCategory; items: SlashCommand[] }> {
  const groups: Record<SlashCategory, SlashCommand[]> = {
    chat: [],
    agent: [],
    tools: [],
    info: [],
  };
  for (const c of commands) groups[c.category].push(c);
  const order: SlashCategory[] = ['chat', 'agent', 'tools', 'info'];
  return order
    .filter((cat) => groups[cat].length > 0)
    .map((cat) => ({ category: cat, items: groups[cat] }));
}

