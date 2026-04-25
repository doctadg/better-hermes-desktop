/**
 * Cron feature — shared types.
 *
 * Defines the discriminated union `PresetSpec` used by the scheduling UI
 * and the bidirectional `presetToCron` / `cronToPreset` parser. The parser
 * is the only piece in this folder that knows how to translate between a
 * structured preset and a 5-field crontab expression — every other module
 * (UI, screens, helpers) consumes `PresetSpec` and never touches the
 * raw cron string except through `humanize` for read-only display.
 *
 * Naming follows the kinds the Hermes server already understands so
 * round-trip reads from `/api/cron/jobs` map cleanly onto a tab in the
 * preset picker. The `'one_time_at'` and `'one_time_in'` kinds are
 * non-cron special cases (ISO timestamp / "5m"-style duration) — they
 * still serialize to a string the server accepts, but they will never be
 * a real 5-field cron expression.
 */
import type { CronJob, CronJobCreate } from '@/api/types';

/** All schedule shapes the editor can produce. `custom_cron` is the escape hatch. */
export type PresetKind =
  | 'one_time_at'
  | 'one_time_in'
  | 'every_minutes'
  | 'every_hours'
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'custom_cron';

/** Day-of-week constant indexed Sunday=0 through Saturday=6. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A structured schedule. The discriminator is `kind`; every concrete
 * variant carries only the fields it actually needs. The UI uses this
 * shape to drive the schedule builder, and the parser converts it to and
 * from a wire-format string with no information loss for the common
 * presets.
 */
export type PresetSpec =
  | {
      kind: 'one_time_at';
      /** ISO 8601 timestamp string (server accepts this verbatim). */
      iso: string;
    }
  | {
      kind: 'one_time_in';
      /** Quantity of `unit`, must be >= 1. */
      value: number;
      unit: 'm' | 'h' | 'd';
    }
  | {
      kind: 'every_minutes';
      /** 1..59 — anything else falls back to `custom_cron`. */
      value: number;
    }
  | {
      kind: 'every_hours';
      /** 1..23 — anything else falls back to `custom_cron`. */
      value: number;
    }
  | {
      kind: 'hourly';
      /** Minute past the hour, 0..59. */
      minute: number;
    }
  | {
      kind: 'daily';
      hour: number;
      minute: number;
    }
  | {
      kind: 'weekdays';
      /** Mon-Fri at HH:MM. */
      hour: number;
      minute: number;
    }
  | {
      kind: 'weekly';
      /** One or more weekdays (Sun=0..Sat=6). Sorted ascending on serialize. */
      days: Weekday[];
      hour: number;
      minute: number;
    }
  | {
      kind: 'monthly';
      /** Day-of-month, 1..31. */
      day: number;
      hour: number;
      minute: number;
    }
  | {
      kind: 'custom_cron';
      /** Raw 5-field cron expression typed by the user. */
      expr: string;
    };

/**
 * Where the rendered cron output is delivered. Mirrors the values the
 * Hermes API recognises for the optional `deliver` field on a cron job.
 * `local` keeps the result in-app only; `origin` echoes back to whatever
 * chat originated the job (when launched from the gateway).
 */
export const DELIVERY_TARGETS = [
  'local',
  'origin',
  'telegram',
  'discord',
  'slack',
  'whatsapp',
  'signal',
  'matrix',
  'mattermost',
  'email',
  'webhook',
  'sms',
  'homeassistant',
  'dingtalk',
  'feishu',
  'wecom',
] as const;

export type DeliveryTarget = (typeof DELIVERY_TARGETS)[number];

/** Friendly display labels for each delivery target. */
export const DELIVERY_TARGET_LABELS: Record<DeliveryTarget, string> = {
  local: 'Local Only',
  origin: 'Origin Chat',
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  matrix: 'Matrix',
  mattermost: 'Mattermost',
  email: 'Email',
  webhook: 'Webhook',
  sms: 'SMS',
  homeassistant: 'Home Assistant',
  dingtalk: 'DingTalk',
  feishu: 'Feishu',
  wecom: 'WeCom',
};

/**
 * Editor draft state. This is a "wide" form — every field the editor
 * binds to is here and we narrow at submit time inside the editor's
 * `buildCreatePayload` / `buildUpdatePayload` helpers.
 */
export interface CronJobDraft {
  name: string;
  prompt: string;
  /** CSV the user types — split by commas at submit time. */
  skillsText: string;
  model: string;
  provider: string;
  baseUrl: string;
  delivery: DeliveryTarget | '';
  timezone: string;
  schedule: PresetSpec;
}

/** Default draft state — used when opening the editor for a brand-new job. */
export function emptyDraft(): CronJobDraft {
  return {
    name: '',
    prompt: '',
    skillsText: '',
    model: '',
    provider: '',
    baseUrl: '',
    delivery: 'local',
    timezone: 'UTC',
    schedule: { kind: 'daily', hour: 9, minute: 0 },
  };
}

/**
 * Lifted status used by the list panel for filtering and badge rendering.
 * Maps the server's free-form `state` + boolean `enabled` into a small
 * closed enum the UI can switch on without sprinkling string compares.
 */
export type JobStatus = 'active' | 'paused' | 'failed' | 'completed' | 'running';

/** Filter values for the left list — `all` is the default. */
export type ListFilter = 'all' | 'active' | 'paused';

/**
 * Re-export the raw API types so callers in this folder can import
 * everything cron-related from one place.
 */
export type { CronJob, CronJobCreate };
