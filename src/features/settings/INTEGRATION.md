# Settings — integration

## Nav entry
- id: `settings`
- label: `Settings`
- icon: `Settings` (lucide-react)

## App.tsx wiring
Replace the existing import + render for Settings:

```tsx
import { SettingsScreen } from '@/features/settings/SettingsScreen';

// in renderScreen():
case 'settings':
  return <SettingsScreen />;
```

The legacy `src/components/screens/SettingsScreen.tsx` becomes dead after the swap and can be deleted in a follow-up cleanup.

## Sections shipped
1. About — version, platform, GitHub link
2. Connection — saved-connections CRUD + test
3. Appearance — theme + accent color picker
4. Network — proxy URL, IPv4-only toggle (no enforcement)
5. Default Model — provider preset + model id + base URL
6. Updates — electron-updater controls + progress events
7. Data — export/import backup as JSON
8. Logs — renderer console ring buffer
9. Shortcuts — static reference card
10. Danger zone — clear local cache (with confirm)

## Required additions to shared files
- None for v0.2 — all sections use existing `window.hermesAPI` (storeGet/Set, models, updater, getVersion) plus the connection store.

## v0.3 follow-ups
- Agent / gateway log viewer (needs a main-process IPC to read `~/.hermes/*.log`)
- Real proxy enforcement (set Electron's session proxy)
- IPv4 force (set `app.commandLine.appendSwitch('disable-features', 'AsyncDns')`)

## Deps
None new.
