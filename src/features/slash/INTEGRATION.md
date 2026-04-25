# Slash Command Integration

This feature lives entirely under `src/features/slash/` and is wired into the
chat input, not into the navigation tree.

- **Nav entry:** _none_ — the menu attaches to `src/components/chat/InputBox.tsx`.
- **Public exports** (from `src/features/slash/index` or per-file imports):
  - `commands.ts` — `SLASH_COMMANDS`, `SlashCommand`, `findCommand`,
    `filterCommands`, `groupByCategory`, `CATEGORY_BADGE_CLASS`,
    `CATEGORY_LABEL`.
  - `SlashMenu.tsx` — `<SlashMenu />` component.
  - `useSlashMenu.ts` — `useSlashMenu(opts)` hook.
  - `dispatch.ts` — `dispatchSlashCommand`, `parseInvocation`, `DispatchResult`.

## Required `lucide-react` icons

Imported in `commands.ts` (one per command, plus container icons in
`SlashMenu`):

`AlertOctagon`, `Bot`, `Bug`, `Check`, `Code`, `Compass`, `FileText`,
`Gauge`, `Globe`, `HardDrive`, `HelpCircle`, `Image`, `ListChecks`,
`MessageSquare`, `Minimize2`, `PauseCircle`, `Plus`, `RefreshCw`,
`RotateCcw`, `Slash`, `Sparkles`, `Tag`, `Terminal`, `Trash2`, `Undo2`,
`User`, `Wrench`, `Zap`.

All ship with `lucide-react@^0.475.0` (already in `package.json`).

## Wiring into `InputBox.tsx`

The current `InputBox` is a plain controlled textarea. Wire the menu in three
small steps. **None** of these are done in this feature commit — the file is
owned by a different agent — so what follows is a copy-paste plan.

### 1. Imports

```tsx
import { useConnectionStore } from '@/stores/connection';
import { SlashMenu } from '@/features/slash/SlashMenu';
import { useSlashMenu } from '@/features/slash/useSlashMenu';
import {
  dispatchSlashCommand,
  parseInvocation,
} from '@/features/slash/dispatch';
```

### 2. Initialise the hook

Inside `InputBox`, alongside `const [text, setText] = useState('')`:

```tsx
const client = useConnectionStore((s) => s.client);

const slash = useSlashMenu({ setValue: setText });
```

### 3. Bind to the textarea

Wrap the `input-container` with `position: relative` (the existing `<div>`
already has `relative`, so no change needed) and place `<SlashMenu />` as a
sibling _before_ the textarea so it floats above:

```tsx
<div className="input-container relative ...">
  <SlashMenu
    open={slash.open}
    items={slash.items}
    selectedIndex={slash.selectedIndex}
    isFiltering={slash.query.length > 1}
    onHover={slash.setSelectedIndex}
    onPick={slash.pickAt}
  />
  {/* existing children, modified textarea below */}
  <textarea
    ref={textareaRef}
    value={text}
    onChange={(e) => {
      setText(e.target.value);
      slash.onInputChange(e.target.value);
    }}
    onKeyDown={(e) => {
      // Slash menu gets first crack at navigation keys.
      if (slash.onKeyDown(e)) return;
      handleKeyDown(e);
    }}
    /* ...rest unchanged... */
  />
</div>
```

### 4. Intercept Enter→send for slash dispatch

In the existing `handleSend` callback (just before `sendMessage(...)`):

```tsx
const trimmed = text.trim();
const invocation = parseInvocation(trimmed);
if (invocation) {
  setText('');
  // optional: optimistically echo the slash invocation as a user message
  const result = await dispatchSlashCommand({
    commandId: invocation.command.id,
    args: invocation.args,
    client,
  });
  if (result.kind === 'local-render') {
    // append `result.content` to the chat as an assistant message via
    // useChatStore — exact wiring depends on the chat store's API.
  }
  // server-dispatched commands surface through the normal SSE/WS flow.
  return;
}
sendMessage(sessionId, trimmed);
```

### Notes for the integrator

- `SlashMenu` is positioned with `absolute bottom-full left-0 right-0` and
  expects a positioned ancestor. The existing `input-container` already uses
  `relative`, so it just works.
- `useSlashMenu` does **not** swallow non-slash keystrokes. Its `onKeyDown`
  returns `false` whenever the menu is closed or the key is irrelevant, so
  the host's normal Enter→send / Shift+Enter→newline behaviour is preserved.
- `pick()` populates the input with `/<name> ` (trailing space) and closes
  the menu — matching the spec.
- `dispatchSlashCommand` is async and may return `{ kind: 'local-render',
  content: string | ReactNode }`. The chat store currently expects string
  content for messages; pass `String(result.content)` if necessary.
- `/help`, `/version`, `/usage`, `/tools`, `/skills`, `/model`, `/memory`,
  `/persona` are local-rendered. `/new` and `/clear` are local but their
  side effects (creating a session, clearing history) must be performed by
  the caller — switch on `result.commandId` after dispatch.
- `/model` reads from `window.hermesAPI.models.list()` — the renderer relies
  on the Phase-0 preload surface and falls back to a soft message when not
  in Electron.
- `/version` reads `window.hermesAPI.getVersion()` with the same fallback.
- `/memory` and `/persona` use `client.getMemory()` / `client.getSoul()`.
- `/tools` uses `client.getToolsets()`. `/skills` uses `client.getSkills()`.
  (Spec mentioned `client.listSkills()` — the actual method on
  `HermesClient` is `getSkills()`; both produce the same `SkillsResponse`.)

## Visual / UX guarantees

- Selected row uses `bg-amber-500/10` with `text-amber-500` (matches spec).
- Other rows use `text-zinc-300` on hover-`bg-zinc-900`.
- Description text is `text-zinc-500 text-xs`.
- Category badge: amber (`agent`), blue (`tools`), emerald (`info`),
  zinc (`chat`).
- Empty filter shows all 27 commands grouped by category with subtle headings.
- Filtering shows a flat list of name/description matches.
- ArrowUp/Down navigate (wrap), Enter/Tab pick, Esc closes.
- `pick()` populates input, closes menu — user can then type args or hit
  Enter to send.
