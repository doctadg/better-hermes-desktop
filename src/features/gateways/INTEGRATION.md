# Gateways — integration

## Nav entry
- id: `gateways`
- label: `Gateways`
- icon: `Send` (lucide-react)

This is a NEW nav entry — there's no existing gateways screen to replace.

## App.tsx wiring
Add a new nav entry and render branch:

```tsx
import { GatewaysScreen } from '@/features/gateways/GatewaysScreen';

// in renderScreen():
case 'gateways':
  return <GatewaysScreen />;
```

## What ships
- 16-platform catalogue (`platforms.ts`) — Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Mattermost, Email, SMS, iMessage, DingTalk, Feishu, WeCom, WeChat, Webhooks, Home Assistant — each with its env-var schema.
- `useGateways` hook: fetches `/api/gateway/status`, merges with locally-saved env values via `window.hermesAPI.storeGet/Set`, computes per-platform status (connected / configured / error / not_configured).
- `GatewayDetail`: per-platform editor with secret masking (eye toggle) + explicit Save.
- `GatewaysScreen`: master/detail orchestrator with status sort + roll-up header.

## Storage layout
Env values are saved client-side under keys of the form:
```
gateway.env.<platformId>.<ENV_NAME>
```

## v0.3 follow-up
The bridge process today does NOT read these client-side values — full feature parity with fathah requires writing them to a profile-scoped `.env` file via a new IPC. Documented but deferred.

## Required additions to shared files
- None — uses existing `client.getGatewayStatus()` and `window.hermesAPI.storeGet/Set`.

## Deps
None new.
