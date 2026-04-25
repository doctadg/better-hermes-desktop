/**
 * Slash command dispatcher.
 *
 * Resolves a parsed `/<cmd> <args>` invocation into either:
 *   - `{ kind: 'local-render', content }` — a pre-rendered markdown string
 *     that the chat surface can append as an assistant-style message.
 *   - `{ kind: 'server-dispatched', response }` — the command was forwarded
 *     to the backend via `client.dispatchCommand`. The caller may still
 *     surface the resulting message (or nothing) as it sees fit.
 *   - `{ kind: 'unknown', message }` — the command id was not recognised.
 *
 * Local commands are intentionally simple and pure: they format a markdown
 * string. Anything that needs UI side-effects (e.g. opening the model picker
 * panel, starting a new session) should be handled by the caller AFTER the
 * dispatcher returns, by inspecting `commandId` directly.
 */

import type { ReactNode } from 'react';
import type { HermesClient } from '@/api/client';
import { SLASH_COMMANDS, findCommand, type SlashCommand } from './commands';

// ─── Window typing helpers ────────────────────────────────────────────────
//
// `src/api/types.ts` describes the legacy `HermesAPI` shape (no `models`,
// `getVersion`, etc). The Phase-0 preload exposes a richer surface; rather
// than mutate the shared types file (out of scope for this feature), we
// use a narrowed local accessor.

interface ModelRowLite {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string | null;
}

interface PreloadAPILite {
  getVersion?: () => Promise<string>;
  models?: {
    list: () => Promise<ModelRowLite[]>;
  };
}

function preloadAPI(): PreloadAPILite | null {
  const w = window as unknown as { hermesAPI?: PreloadAPILite };
  return w.hermesAPI ?? null;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

export interface DispatchInput {
  commandId: string;
  args: string;
  client: HermesClient | null;
}

export type DispatchResult =
  | { kind: 'local-render'; commandId: string; content: string | ReactNode }
  | { kind: 'server-dispatched'; commandId: string; response: unknown }
  | { kind: 'unknown'; commandId: string; message: string };

/**
 * Parse a raw input line like `"/web some query"` into `{ commandId, args }`.
 * Returns `null` if the line does not look like a slash command.
 */
export function parseInvocation(
  line: string
): { command: SlashCommand; args: string } | null {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  const command = findCommand(head);
  if (!command) return null;
  return { command, args };
}

export async function dispatchSlashCommand({
  commandId,
  args,
  client,
}: DispatchInput): Promise<DispatchResult> {
  const command = findCommand(commandId);
  if (!command) {
    return {
      kind: 'unknown',
      commandId,
      message: `Unknown command: /${commandId}`,
    };
  }

  if (command.kind === 'local') {
    const content = await renderLocalCommand(command, args, client);
    return { kind: 'local-render', commandId: command.id, content };
  }

  // Server-side: forward to backend.
  if (!client) {
    return {
      kind: 'local-render',
      commandId: command.id,
      content: '_Not connected to a server. Cannot dispatch this command._',
    };
  }

  try {
    const response = await client.dispatchCommand({
      command: command.name,
      args: args || undefined,
    });
    return { kind: 'server-dispatched', commandId: command.id, response };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      kind: 'local-render',
      commandId: command.id,
      content: `**Error dispatching ${command.name}:** ${msg}`,
    };
  }
}

// ─── Local renderers ──────────────────────────────────────────────────────

async function renderLocalCommand(
  command: SlashCommand,
  args: string,
  client: HermesClient | null
): Promise<string> {
  switch (command.id) {
    case 'help':
      return renderHelp();

    case 'version':
      return renderVersion();

    case 'usage':
      return renderUsage();

    case 'tools':
      return renderToolsets(client);

    case 'skills':
      return renderSkills(client);

    case 'model':
      return renderModels();

    case 'memory':
      return renderMemory(client);

    case 'persona':
      return renderPersona(client);

    case 'new':
      // The InputBox owns "new chat" UI — just acknowledge.
      return '_Starting a new chat..._';

    case 'clear':
      // Caller is expected to handle clearing. Render an ack so the user
      // gets feedback even if no caller hook is wired up.
      return '_Cleared the current conversation._';

    default:
      // Fallback for a local command without a custom renderer.
      return `**${command.name}** ${args ? `\`${args}\`` : ''}`.trim();
  }
}

function renderHelp(): string {
  const order: Array<['chat' | 'agent' | 'tools' | 'info', string]> = [
    ['chat', 'Chat'],
    ['agent', 'Agent'],
    ['tools', 'Tools'],
    ['info', 'Info'],
  ];
  const lines: string[] = ['**Available Commands**\n'];
  for (const [cat, label] of order) {
    const items = SLASH_COMMANDS.filter((c) => c.category === cat);
    if (!items.length) continue;
    lines.push(`\n**${label}**`);
    for (const c of items) {
      const hint = c.defaultArgsHint ? ` ${c.defaultArgsHint}` : '';
      lines.push(`- \`${c.name}${hint}\` — ${c.description}`);
    }
  }
  return lines.join('\n');
}

async function renderVersion(): Promise<string> {
  const api = preloadAPI();
  if (!api?.getVersion) {
    return '**Hermes Desktop** — version unavailable (not running in Electron).';
  }
  try {
    const v = await api.getVersion();
    return `**Hermes Desktop** v${v}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `**Hermes Desktop** — failed to read version: ${msg}`;
  }
}

function renderUsage(): string {
  // Without a usage feed wired in, surface a placeholder. Other features can
  // replace this with real per-session token / cost data later.
  return [
    '**Usage**',
    '',
    '_No usage data yet — send a message and try again._',
  ].join('\n');
}

async function renderToolsets(client: HermesClient | null): Promise<string> {
  if (!client) return '_Not connected to a server._';
  try {
    const toolsets = await client.getToolsets();
    if (!toolsets.length) return '_No toolsets configured on the server._';
    const rows = toolsets
      .map((t) => {
        const label = t.label ?? t.name;
        const state = t.enabled ? '*(enabled)*' : '*(disabled)*';
        return `- **${label}** — ${t.description ?? ''} ${state}`;
      })
      .join('\n');
    return `**Available Toolsets**\n\n${rows}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `**Failed to fetch toolsets:** ${msg}`;
  }
}

async function renderSkills(client: HermesClient | null): Promise<string> {
  if (!client) return '_Not connected to a server._';
  try {
    const skills = await client.getSkills();
    if (!skills.length) return '_No skills installed._';
    const rows = skills
      .map((s) => {
        const cat = s.category ? `_(${s.category})_` : '';
        return `- **${s.name}** ${cat} — ${s.description}`;
      })
      .join('\n');
    return `**Installed Skills**\n\n${rows}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `**Failed to fetch skills:** ${msg}`;
  }
}

async function renderModels(): Promise<string> {
  const api = preloadAPI();
  if (!api?.models?.list) {
    return '_Model library unavailable (not running in Electron)._';
  }
  try {
    const rows = await api.models.list();
    if (!rows.length) {
      return '_No models saved yet. Add one from the Models settings._';
    }
    const lines = rows.map((m) => {
      const url = m.base_url ? ` _(${m.base_url})_` : '';
      return `- **${m.name}** — \`${m.model}\` via ${m.provider}${url}`;
    });
    return `**Saved Models**\n\n${lines.join('\n')}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `**Failed to list models:** ${msg}`;
  }
}

async function renderMemory(client: HermesClient | null): Promise<string> {
  if (!client) return '_Not connected to a server._';
  try {
    const mem = await client.getMemory();
    const trimmed = mem.content.trim();
    if (!trimmed) return '_No memory entries yet._';
    const preview = trimmed.split('\n').slice(0, 12).join('\n');
    const truncated = trimmed.split('\n').length > 12;
    return [
      '**MEMORY.md** _(preview)_',
      '',
      preview,
      truncated ? '\n_…truncated. Open the Memory pane to see more._' : '',
    ]
      .filter(Boolean)
      .join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `**Failed to read memory:** ${msg}`;
  }
}

async function renderPersona(client: HermesClient | null): Promise<string> {
  if (!client) return '_Not connected to a server._';
  try {
    const soul = await client.getSoul();
    const trimmed = soul.content.trim();
    if (!trimmed) return '_No persona configured._';
    return `**Current Persona**\n\n${trimmed}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `**Failed to read persona:** ${msg}`;
  }
}
