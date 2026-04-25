# Cron / Schedules — integration

## Nav entry
- id: `schedules`
- label: `Schedules`
- icon: `CalendarClock` (lucide-react)

## App.tsx wiring
Replace the existing render for Schedules:

```tsx
import { SchedulesScreen } from '@/features/cron/SchedulesScreen';

// in renderScreen():
case 'schedules':
  return <SchedulesScreen />;
```

The legacy `src/components/screens/SchedulesScreen.tsx` becomes dead after the swap.

## What ships
- Master/detail orchestrator (SchedulesScreen) with inline list + filters (All / Active / Paused) + 30s auto-refresh.
- CronJobEditor with full payload form (name / prompt / skills / model / provider / baseURL / delivery target / timezone) and the schedule builder.
- PresetTabs: tabbed builder for one-time / interval / hourly / daily / weekdays / weekly / monthly / custom-cron, with bidirectional preset↔cron parsing.
- cronParser.ts: pure TS round-trip parser with `presetToCron`, `cronToPreset`, `humanize` (zero deps).
- types.ts: PresetKind discriminated union + DeliveryTarget enum.

## Required additions to shared files
- None — uses existing `client.listCronJobs / createCronJob / updateCronJob / deleteCronJob / pauseCronJob / resumeCronJob / triggerCronJob` from `src/api/client.ts`.

## Deps
None new.
