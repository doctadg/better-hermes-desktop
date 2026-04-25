# Tools feature integration

Built for Phase 1G. Replaces the legacy `src/components/screens/ToolsScreen.tsx`
with a tabbed experience that pairs server-side toolsets with a locally
managed MCP (Model Context Protocol) server registry.

## Files

- `ToolsScreen.tsx` — top-level screen, hosts the two tabs.
- `ToolsetsTab.tsx` — built-in toolsets fetched via `client.getToolsets()`,
  grouped by category, each with a Power toggle.
- `McpServersTab.tsx` — list/detail CRUD over the local MCP server config
  store.
- `mcpStorage.ts` — typed `loadMcpServers()` / `saveMcpServers()` wrappers
  over `window.hermesAPI.storeGet/storeSet` with shape validation.
- `types.ts` — `McpServerConfig`.

## App.tsx wiring

1. Update the `NAV_ITEMS` `tools` entry to use the new screen.

   ```ts
   import { Wrench } from 'lucide-react';
   import { ToolsScreen } from '@/features/tools/ToolsScreen';

   // In NAV_ITEMS, replace the existing { id: 'tools', ... } entry with:
   { id: 'tools', label: 'Tools', icon: <Wrench size={18} /> },
   ```

2. In `renderScreen()`, swap the import:

   ```ts
   case 'tools':
     return <ToolsScreen />;  // from '@/features/tools/ToolsScreen'
   ```

3. Remove the legacy import:
   `import { ToolsScreen } from '@/components/screens/ToolsScreen';`
   (the file itself can stay; nothing else depends on it).

The `'tools'` `NavItem` id and order are unchanged, so no other call site
needs updating.

## client.ts gaps

The shared `HermesClient` (`src/api/client.ts`) currently exposes
`getToolsets()` (read) but **does not** expose a setter. The toolset toggle
in `ToolsetsTab.tsx` therefore routes through the generic preload escape
hatch `window.hermesAPI.invoke('toolsets:set-enabled', { name, enabled })`.

If/when the Hermes server grows a toggle endpoint, the recommended fix is
to add a typed method on `HermesClient`:

```ts
// In src/api/client.ts (NOT touched by this feature):
async setToolsetEnabled(name: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${this.baseUrl}/api/tools/toolsets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: this.getHeaders(),
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`Failed to set toolset enabled: ${res.status}`);
}
```

…and replace the `setToolsetEnabledViaBridge()` helper in
`ToolsetsTab.tsx` with a direct call.

Until then, the UI surfaces a non-blocking warning when the bridge call
rejects so users understand toggling is read-only on this build.

## v0.3 — spawning MCP servers (future)

This feature only **stores** MCP server configurations. Actually launching
them requires main-process work that is out of scope for Phase 1G:

- New IPC handlers in `electron/ipc-handlers.ts`:
  - `mcp:start` / `mcp:stop` / `mcp:list-running`
  - Streams stdout/stderr to the renderer over a typed event channel.
- A supervisor in `electron/main.ts` that respects the `autostart` flag
  on app launch and tears children down on quit.
- Ingestion: the spawned MCP server's tool catalog should be merged into
  the active session's tool list (probably via a Hermes server endpoint
  that proxies MCP traffic — TBD).

The local registry built here is forward-compatible: when the supervisor
lands, it can simply read the same `mcp_servers` key from the KV store.

## Schema

`window.hermesAPI.storeGet('mcp_servers')` is an array of:

```ts
{
  id: string;           // stable, e.g. "mcp_lk2j_3a8z"
  name: string;         // display label
  command: string;      // executable, e.g. "npx"
  args: string[];       // argv
  env: Record<string, string>;
  autostart: boolean;
  enabled: boolean;
}
```

`mcpStorage.ts` validates the shape on read and silently drops malformed
entries — older saves with extra fields are tolerated, but missing/wrong
required fields cause that row to be skipped.
