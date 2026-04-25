/**
 * Bidirectional preset <-> cron parser.
 *
 * Pure TypeScript, **zero runtime dependencies** — this module is
 * deliberately vanilla so it can be imported by the renderer, a Node
 * helper, or tests without dragging in a cron library that is 50× its
 * size and only handles half the cases the UI cares about.
 *
 * Three exports:
 *   - `presetToCron(spec)` serialises a `PresetSpec` into a wire format
 *     accepted by the Hermes cron API. For the canonical "5-field cron"
 *     presets this produces a real crontab string ("0 9 * * 1-5"); for
 *     the two non-cron presets (`one_time_at`, `one_time_in`) it produces
 *     the special-case strings that the server matches via prefix sniff
 *     (an ISO timestamp, or "5m" / "2h" / "1d").
 *   - `cronToPreset(expr)` does the inverse. It tries the special cases
 *     first, then the structured presets, and falls back to
 *     `{ kind: 'custom_cron', expr }` if nothing matches. Returns `null`
 *     only when the input is empty or syntactically not a 5-field cron
 *     and not one of the duration / timestamp specials.
 *   - `humanize(expr, tz?)` produces a short English description for
 *     display in the list panel and live preview. Never throws — falls
 *     back to the raw expression if it cannot find a friendly form.
 *
 * Design notes:
 *   - The parser intentionally only recognises the *known* preset
 *     shapes. A cron like `15,45 * * * *` round-trips as `custom_cron`,
 *     not `every_minutes`, because the editor has no UI for "two minutes
 *     past the hour with a 30-minute gap" and silently coercing it into
 *     the wrong preset would be lossy.
 *   - `every_minutes` and `every_hours` are written using the
 *     wildcard step form (asterisk slash N) rather than enumerated lists
 *     ("0,5,10,..."). The server scheduler accepts both but the step
 *     form is what humans write by hand and what we want to display.
 *   - All time values are validated and clamped on serialise so the
 *     editor's draft state can be a little sloppy without producing an
 *     invalid expression.
 */
import type { PresetSpec, Weekday } from './types';

// ─── helpers ─────────────────────────────────────────────────────────────

const MIN_INT = 0;
const MAX_MINUTE = 59;
const MAX_HOUR = 23;
const MAX_DAY = 31;
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  const intVal = Math.trunc(value);
  if (intVal < lo) return lo;
  if (intVal > hi) return hi;
  return intVal;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Returns true if the field is the wildcard `*`. */
function isStar(field: string): boolean {
  return field === '*';
}

/** Parses a strictly-numeric cron field; returns null on `*`, ranges, lists, steps. */
function parseNumeric(field: string): number | null {
  if (isStar(field)) return null;
  if (!/^\d+$/.test(field)) return null;
  return Number.parseInt(field, 10);
}

/**
 * Parses a wildcard step expression of the form "asterisk slash N",
 * returning N. Anything else (a step on a range, a step with a base, a
 * literal) returns null.
 */
function parseStarStep(field: string): number | null {
  const match = /^\*\/(\d+)$/.exec(field);
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** Parses a comma-separated list of weekdays into a sorted unique Weekday[]. */
function parseWeekdayList(field: string): Weekday[] | null {
  if (isStar(field)) return null;
  const parts = field.split(',').map((p) => p.trim());
  const result: Weekday[] = [];
  for (const part of parts) {
    if (!/^[0-7]$/.test(part)) return null;
    let n = Number.parseInt(part, 10);
    // Accept 7 as Sunday (some crontabs use 7, normalise to 0)
    if (n === 7) n = 0;
    const w = n as Weekday;
    if (!result.includes(w)) result.push(w);
  }
  if (result.length === 0) return null;
  result.sort((a, b) => a - b);
  return result;
}

/**
 * Recognises an ISO 8601 timestamp string. We accept both the strict
 * `YYYY-MM-DDTHH:MM:SS` form and the variant with a fractional-second /
 * Z suffix that `Date.prototype.toISOString` produces. Using the native
 * `Date` parser keeps this dependency-free; we cross-check by re-printing
 * to guard against `Date` accepting bizarre legacy formats like
 * `"2024 03 04"`.
 */
function parseIsoTimestamp(value: string): Date | null {
  // Quick reject anything that doesn't look ISO-shaped — `new Date("foo")`
  // returns Invalid Date, but `new Date("12/31/2024")` succeeds and we do
  // NOT want to claim that as `one_time_at`.
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(value)) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Recognises duration strings of the form `<digits><m|h|d>`, e.g. `5m`,
 * `12h`, `2d`. Returns the parsed value + unit or null.
 */
function parseDuration(value: string): { value: number; unit: 'm' | 'h' | 'd' } | null {
  const match = /^(\d+)\s*([mhd])$/i.exec(value.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const unit = match[2]!.toLowerCase() as 'm' | 'h' | 'd';
  return { value: n, unit };
}

/** Splits a cron expression on whitespace, dropping empty tokens. */
function splitFields(expr: string): string[] {
  return expr.trim().split(/\s+/).filter((f) => f.length > 0);
}

// ─── presetToCron ────────────────────────────────────────────────────────

/**
 * Convert a structured preset into a string the Hermes cron API accepts.
 *
 * For canonical 5-field presets returns a crontab expression. For the
 * `one_time_at` and `one_time_in` specials returns the timestamp /
 * duration string the server recognises by prefix.
 *
 * Inputs are clamped — `{ kind: 'daily', hour: 99, minute: -3 }` becomes
 * `"0 23 * * *"` rather than producing an invalid expression. The one
 * exception is `custom_cron` which is returned verbatim (after a trim);
 * the user explicitly asked to bypass the structured form, so we trust
 * what they wrote.
 */
export function presetToCron(spec: PresetSpec): string {
  switch (spec.kind) {
    case 'one_time_at':
      // Trim only — the timestamp is opaque to the cron grammar.
      return spec.iso.trim();

    case 'one_time_in': {
      const v = clamp(spec.value, 1, Number.MAX_SAFE_INTEGER);
      return `${v}${spec.unit}`;
    }

    case 'every_minutes': {
      const v = clamp(spec.value, 1, MAX_MINUTE);
      return `*/${v} * * * *`;
    }

    case 'every_hours': {
      const v = clamp(spec.value, 1, MAX_HOUR);
      return `0 */${v} * * *`;
    }

    case 'hourly': {
      const m = clamp(spec.minute, MIN_INT, MAX_MINUTE);
      return `${m} * * * *`;
    }

    case 'daily': {
      const m = clamp(spec.minute, MIN_INT, MAX_MINUTE);
      const h = clamp(spec.hour, MIN_INT, MAX_HOUR);
      return `${m} ${h} * * *`;
    }

    case 'weekdays': {
      const m = clamp(spec.minute, MIN_INT, MAX_MINUTE);
      const h = clamp(spec.hour, MIN_INT, MAX_HOUR);
      return `${m} ${h} * * 1-5`;
    }

    case 'weekly': {
      const m = clamp(spec.minute, MIN_INT, MAX_MINUTE);
      const h = clamp(spec.hour, MIN_INT, MAX_HOUR);
      // Defensive: if the caller handed us an empty array we fall back
      // to "Sunday" so the resulting expression is at least valid cron.
      const daysSrc = spec.days.length > 0 ? spec.days : [0];
      const daysSorted = [...new Set(daysSrc)].sort((a, b) => a - b);
      return `${m} ${h} * * ${daysSorted.join(',')}`;
    }

    case 'monthly': {
      const m = clamp(spec.minute, MIN_INT, MAX_MINUTE);
      const h = clamp(spec.hour, MIN_INT, MAX_HOUR);
      const d = clamp(spec.day, 1, MAX_DAY);
      return `${m} ${h} ${d} * *`;
    }

    case 'custom_cron':
      return spec.expr.trim();
  }
}

// ─── cronToPreset ────────────────────────────────────────────────────────

/**
 * Parse a wire-format string back into a `PresetSpec`. Returns null only
 * when the input is empty / whitespace; an unrecognised expression with
 * non-empty content always falls back to `{ kind: 'custom_cron', expr }`
 * so the editor can still display and round-trip it.
 *
 * Detection order:
 *   1. Empty -> null.
 *   2. ISO timestamp -> `one_time_at`.
 *   3. Duration (`5m`/`2h`/`1d`) -> `one_time_in`.
 *   4. 5-field cron, structured matchers in narrowest-first order.
 *   5. Anything else -> `custom_cron`.
 *
 * The structured matchers test for a *specific* shape — we never coerce
 * `"15 9 * * 2,4"` into `weekly` if the field has multiple weekdays,
 * because the editor's "weekly" tab handles exactly that, but
 * `"15 * 1 * *"` (run at quarter past every hour on the first of the
 * month) is left as `custom_cron` since no preset captures it.
 */
export function cronToPreset(expr: string): PresetSpec | null {
  const trimmed = expr.trim();
  if (trimmed.length === 0) return null;

  // 2. ISO timestamp
  const iso = parseIsoTimestamp(trimmed);
  if (iso !== null) {
    return { kind: 'one_time_at', iso: trimmed };
  }

  // 3. Duration
  const dur = parseDuration(trimmed);
  if (dur !== null) {
    return { kind: 'one_time_in', value: dur.value, unit: dur.unit };
  }

  // 4. 5-field cron
  const fields = splitFields(trimmed);
  if (fields.length !== 5) {
    return { kind: 'custom_cron', expr: trimmed };
  }
  const [minStr, hourStr, domStr, monStr, dowStr] = fields as [string, string, string, string, string];

  // Reject anything that uses the month field (we have no monthly-by-month preset).
  if (!isStar(monStr)) {
    return { kind: 'custom_cron', expr: trimmed };
  }

  // every_minutes: "*/N * * * *"
  const minStep = parseStarStep(minStr);
  if (
    minStep !== null &&
    minStep >= 1 &&
    minStep <= MAX_MINUTE &&
    isStar(hourStr) &&
    isStar(domStr) &&
    isStar(dowStr)
  ) {
    return { kind: 'every_minutes', value: minStep };
  }

  // every_hours: "0 */N * * *"
  const hourStep = parseStarStep(hourStr);
  if (
    hourStep !== null &&
    hourStep >= 1 &&
    hourStep <= MAX_HOUR &&
    parseNumeric(minStr) === 0 &&
    isStar(domStr) &&
    isStar(dowStr)
  ) {
    return { kind: 'every_hours', value: hourStep };
  }

  const minute = parseNumeric(minStr);
  const hour = parseNumeric(hourStr);

  // hourly: "M * * * *" (M numeric, everything else star)
  if (
    minute !== null &&
    minute >= 0 &&
    minute <= MAX_MINUTE &&
    isStar(hourStr) &&
    isStar(domStr) &&
    isStar(dowStr)
  ) {
    return { kind: 'hourly', minute };
  }

  // The remaining structured presets all need both M and H to be numeric.
  if (minute === null || hour === null) {
    return { kind: 'custom_cron', expr: trimmed };
  }
  if (minute < 0 || minute > MAX_MINUTE || hour < 0 || hour > MAX_HOUR) {
    return { kind: 'custom_cron', expr: trimmed };
  }

  // weekdays: "M H * * 1-5"
  if (isStar(domStr) && dowStr === '1-5') {
    return { kind: 'weekdays', hour, minute };
  }

  // daily: "M H * * *"
  if (isStar(domStr) && isStar(dowStr)) {
    return { kind: 'daily', hour, minute };
  }

  // weekly: "M H * * D[,D...]" where each D is 0-7
  if (isStar(domStr)) {
    const days = parseWeekdayList(dowStr);
    if (days !== null && days.length > 0) {
      return { kind: 'weekly', days, hour, minute };
    }
  }

  // monthly: "M H D * *" where D is 1-31
  if (isStar(dowStr)) {
    const day = parseNumeric(domStr);
    if (day !== null && day >= 1 && day <= MAX_DAY) {
      return { kind: 'monthly', day, hour, minute };
    }
  }

  return { kind: 'custom_cron', expr: trimmed };
}

// ─── humanize ────────────────────────────────────────────────────────────

/**
 * Human-readable description of a schedule, e.g. "Every weekday at 09:00".
 * Falls back to the raw expression if it cannot find a friendly form so
 * the live preview always shows *something*.
 *
 * The optional `tz` is appended in parentheses when present so users
 * scheduling for a non-UTC timezone get an unambiguous read-out.
 */
export function humanize(expr: string, tz?: string): string {
  const trimmed = expr.trim();
  if (trimmed.length === 0) return 'No schedule';

  const spec = cronToPreset(trimmed);
  if (spec === null) return trimmed;

  const tzSuffix = tz && tz.trim().length > 0 && tz.trim() !== 'UTC' ? ` (${tz.trim()})` : '';

  switch (spec.kind) {
    case 'one_time_at': {
      const date = parseIsoTimestamp(spec.iso);
      if (date === null) return `Once at ${spec.iso}`;
      const datePart = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
      const timePart = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
      return `Once at ${datePart} ${timePart} UTC`;
    }

    case 'one_time_in': {
      const unitWord =
        spec.unit === 'm'
          ? spec.value === 1
            ? 'minute'
            : 'minutes'
          : spec.unit === 'h'
          ? spec.value === 1
            ? 'hour'
            : 'hours'
          : spec.value === 1
          ? 'day'
          : 'days';
      return `Once in ${spec.value} ${unitWord}`;
    }

    case 'every_minutes':
      return `Every ${spec.value} ${spec.value === 1 ? 'minute' : 'minutes'}`;

    case 'every_hours':
      return `Every ${spec.value} ${spec.value === 1 ? 'hour' : 'hours'}`;

    case 'hourly':
      return `Every hour at :${pad2(spec.minute)}${tzSuffix}`;

    case 'daily':
      return `Every day at ${pad2(spec.hour)}:${pad2(spec.minute)}${tzSuffix}`;

    case 'weekdays':
      return `Every weekday at ${pad2(spec.hour)}:${pad2(spec.minute)}${tzSuffix}`;

    case 'weekly': {
      const names = spec.days.map((d) => WEEKDAY_NAMES[d]);
      const dayList = names.length === 1 ? WEEKDAY_LONG[spec.days[0]!] : names.join(', ');
      return `Every ${dayList} at ${pad2(spec.hour)}:${pad2(spec.minute)}${tzSuffix}`;
    }

    case 'monthly':
      return `Day ${spec.day} of every month at ${pad2(spec.hour)}:${pad2(spec.minute)}${tzSuffix}`;

    case 'custom_cron':
      return spec.expr;
  }
}

// ─── self-test for round-trip property (dev only) ────────────────────────
//
// These are static fixtures exercised by importing this module in a Node
// REPL; they are *not* an automated test runner — the project ships
// without a test framework wired in for renderer code. Keeping them
// adjacent to the parser ensures that anyone modifying the matchers can
// do a one-line `eval(presetRoundTripFixtures.length)` smoke check.

/**
 * Static set of `PresetSpec` values that must round-trip through
 * `presetToCron` -> `cronToPreset` and come back equal (after JSON
 * normalisation). Exposed so an integrator or the editor's preview can
 * sanity-check the parser at runtime if desired.
 */
export const presetRoundTripFixtures: ReadonlyArray<PresetSpec> = [
  { kind: 'every_minutes', value: 5 },
  { kind: 'every_minutes', value: 30 },
  { kind: 'every_hours', value: 1 },
  { kind: 'every_hours', value: 12 },
  { kind: 'hourly', minute: 0 },
  { kind: 'hourly', minute: 15 },
  { kind: 'daily', hour: 9, minute: 0 },
  { kind: 'daily', hour: 23, minute: 30 },
  { kind: 'weekdays', hour: 9, minute: 0 },
  { kind: 'weekly', days: [1], hour: 9, minute: 0 },
  { kind: 'weekly', days: [1, 3, 5], hour: 14, minute: 30 },
  { kind: 'monthly', day: 1, hour: 0, minute: 0 },
  { kind: 'monthly', day: 15, hour: 12, minute: 30 },
  { kind: 'one_time_in', value: 5, unit: 'm' },
  { kind: 'one_time_in', value: 2, unit: 'h' },
  { kind: 'one_time_in', value: 1, unit: 'd' },
  { kind: 'one_time_at', iso: '2026-12-31T23:59:00Z' },
  { kind: 'custom_cron', expr: '15,45 * * * 2,4' },
];

/**
 * Run the round-trip fixtures and return any specs that failed to
 * survive serialise + parse. Returns an empty array when everything is
 * happy. Pure — does not throw.
 */
export function verifyRoundTrip(): Array<{ input: PresetSpec; output: PresetSpec | null; cron: string }> {
  const failures: Array<{ input: PresetSpec; output: PresetSpec | null; cron: string }> = [];
  for (const input of presetRoundTripFixtures) {
    const cron = presetToCron(input);
    const parsed = cronToPreset(cron);
    if (JSON.stringify(input) !== JSON.stringify(parsed)) {
      failures.push({ input, output: parsed, cron });
    }
  }
  return failures;
}
