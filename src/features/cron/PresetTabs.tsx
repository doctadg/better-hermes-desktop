/**
 * PresetTabs — schedule builder UI.
 *
 * Controlled component owned by the editor. Renders one tab per
 * `PresetKind` and delegates the per-tab fields (minute / hour / weekday
 * picker / interval / raw cron) to inline blocks. The component is
 * deliberately stateless about the active tab — the parent owns
 * `value: PresetSpec` and we derive the active tab from it on every
 * render. This keeps the editor's draft state the single source of
 * truth and avoids drift between a "selected tab" and the actual
 * schedule.
 *
 * Live preview: every change runs through `presetToCron` -> `humanize`
 * so the user sees the resulting cron string and its English form
 * immediately. The custom-cron tab is special: it edits the raw
 * expression directly and the live preview is the only validation the
 * user gets.
 *
 * Reused by `CronJobEditor` — extracted into its own file so a future
 * inline-schedule picker on a chat composer can drop it in unchanged.
 */
import { useCallback, useMemo } from 'react';
import { presetToCron, humanize } from './cronParser';
import type { PresetKind, PresetSpec, Weekday } from './types';

const TAB_ORDER: ReadonlyArray<{ id: PresetKind; label: string }> = [
  { id: 'one_time_at', label: 'One-time' },
  { id: 'one_time_in', label: 'In' },
  { id: 'every_minutes', label: 'Every N min' },
  { id: 'every_hours', label: 'Every N hr' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'custom_cron', label: 'Custom' },
];

const WEEKDAY_OPTIONS: ReadonlyArray<{ value: Weekday; short: string; long: string }> = [
  { value: 0, short: 'S', long: 'Sun' },
  { value: 1, short: 'M', long: 'Mon' },
  { value: 2, short: 'T', long: 'Tue' },
  { value: 3, short: 'W', long: 'Wed' },
  { value: 4, short: 'T', long: 'Thu' },
  { value: 5, short: 'F', long: 'Fri' },
  { value: 6, short: 'S', long: 'Sat' },
];

interface PresetTabsProps {
  value: PresetSpec;
  onChange: (next: PresetSpec) => void;
  /** Optional timezone shown in the preview line. */
  tz?: string;
}

/**
 * Build a sensible default `PresetSpec` for a given kind. Used when the
 * user clicks a tab — we cannot reuse the previous spec's fields because
 * the discriminator changes.
 */
function defaultForKind(kind: PresetKind): PresetSpec {
  switch (kind) {
    case 'one_time_at':
      return { kind: 'one_time_at', iso: defaultIsoOneHourAhead() };
    case 'one_time_in':
      return { kind: 'one_time_in', value: 5, unit: 'm' };
    case 'every_minutes':
      return { kind: 'every_minutes', value: 30 };
    case 'every_hours':
      return { kind: 'every_hours', value: 1 };
    case 'hourly':
      return { kind: 'hourly', minute: 0 };
    case 'daily':
      return { kind: 'daily', hour: 9, minute: 0 };
    case 'weekdays':
      return { kind: 'weekdays', hour: 9, minute: 0 };
    case 'weekly':
      return { kind: 'weekly', days: [1], hour: 9, minute: 0 };
    case 'monthly':
      return { kind: 'monthly', day: 1, hour: 9, minute: 0 };
    case 'custom_cron':
      return { kind: 'custom_cron', expr: '0 9 * * *' };
  }
}

function defaultIsoOneHourAhead(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  // Strip milliseconds so the picker reads cleanly.
  d.setMilliseconds(0);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Convert an ISO timestamp into the value an `<input type="datetime-local">`
 * expects (`YYYY-MM-DDTHH:MM`, no timezone). The picker is local-time only
 * so we render in the user's local timezone; on submit we convert back
 * to an ISO Z-suffixed string.
 */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function PresetTabs({ value, onChange, tz }: PresetTabsProps): React.JSX.Element {
  const activeKind = value.kind;

  const previewExpr = useMemo(() => {
    try {
      return presetToCron(value);
    } catch {
      return '';
    }
  }, [value]);

  const previewHuman = useMemo(() => humanize(previewExpr, tz), [previewExpr, tz]);

  const handleTabClick = useCallback(
    (kind: PresetKind) => {
      if (kind === activeKind) return;
      onChange(defaultForKind(kind));
    },
    [activeKind, onChange],
  );

  return (
    <div className="space-y-3">
      {/* Tab strip — wraps on narrow widths */}
      <div className="flex flex-wrap gap-1.5">
        {TAB_ORDER.map((tab) => {
          const isActive = tab.id === activeKind;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={
                isActive
                  ? 'px-2.5 py-1 text-[11px] rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 transition-colors duration-150'
                  : 'px-2.5 py-1 text-[11px] rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition-colors duration-150'
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Per-tab inputs */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <PresetBody value={value} onChange={onChange} />
      </div>

      {/* Live preview */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Preview</div>
        <div className="text-xs text-zinc-300">{previewHuman}</div>
        <div className="text-[11px] font-mono text-zinc-500 mt-0.5 truncate">{previewExpr || '—'}</div>
      </div>
    </div>
  );
}

// ─── per-tab bodies ──────────────────────────────────────────────────────

function PresetBody({
  value,
  onChange,
}: {
  value: PresetSpec;
  onChange: (next: PresetSpec) => void;
}): React.JSX.Element {
  switch (value.kind) {
    case 'one_time_at':
      return <OneTimeAtBody value={value} onChange={onChange} />;
    case 'one_time_in':
      return <OneTimeInBody value={value} onChange={onChange} />;
    case 'every_minutes':
      return (
        <IntervalBody
          label="minutes"
          min={1}
          max={59}
          value={value.value}
          onChange={(n) => onChange({ kind: 'every_minutes', value: n })}
        />
      );
    case 'every_hours':
      return (
        <IntervalBody
          label="hours"
          min={1}
          max={23}
          value={value.value}
          onChange={(n) => onChange({ kind: 'every_hours', value: n })}
        />
      );
    case 'hourly':
      return (
        <SingleNumberBody
          label="Minute past the hour"
          min={0}
          max={59}
          value={value.minute}
          onChange={(n) => onChange({ kind: 'hourly', minute: n })}
        />
      );
    case 'daily':
      return (
        <TimeOfDayBody
          hour={value.hour}
          minute={value.minute}
          onChange={(hour, minute) => onChange({ kind: 'daily', hour, minute })}
        />
      );
    case 'weekdays':
      return (
        <TimeOfDayBody
          hour={value.hour}
          minute={value.minute}
          onChange={(hour, minute) => onChange({ kind: 'weekdays', hour, minute })}
        />
      );
    case 'weekly':
      return <WeeklyBody value={value} onChange={onChange} />;
    case 'monthly':
      return <MonthlyBody value={value} onChange={onChange} />;
    case 'custom_cron':
      return <CustomCronBody value={value} onChange={onChange} />;
  }
}

function OneTimeAtBody({
  value,
  onChange,
}: {
  value: Extract<PresetSpec, { kind: 'one_time_at' }>;
  onChange: (next: PresetSpec) => void;
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-[11px] text-zinc-500 mb-1">Date and time (local)</label>
      <input
        type="datetime-local"
        value={isoToLocalInput(value.iso)}
        onChange={(e) => onChange({ kind: 'one_time_at', iso: localInputToIso(e.target.value) })}
        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
      />
    </div>
  );
}

function OneTimeInBody({
  value,
  onChange,
}: {
  value: Extract<PresetSpec, { kind: 'one_time_in' }>;
  onChange: (next: PresetSpec) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-500">In</span>
      <input
        type="number"
        min={1}
        value={value.value}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          onChange({
            kind: 'one_time_in',
            value: Number.isFinite(n) && n >= 1 ? n : 1,
            unit: value.unit,
          });
        }}
        className="w-20 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
      />
      <select
        value={value.unit}
        onChange={(e) =>
          onChange({
            kind: 'one_time_in',
            value: value.value,
            unit: e.target.value as 'm' | 'h' | 'd',
          })
        }
        className="px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
      >
        <option value="m">minutes</option>
        <option value="h">hours</option>
        <option value="d">days</option>
      </select>
      <span className="text-xs text-zinc-500">from now</span>
    </div>
  );
}

function IntervalBody({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-500">Every</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min);
        }}
        className="w-20 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
      />
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}

function SingleNumberBody({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-[11px] text-zinc-500 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min);
        }}
        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
      />
    </div>
  );
}

function TimeOfDayBody({
  hour,
  minute,
  onChange,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}): React.JSX.Element {
  const value = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  return (
    <div>
      <label className="block text-[11px] text-zinc-500 mb-1">Time of day</label>
      <input
        type="time"
        value={value}
        onChange={(e) => {
          const [h, m] = e.target.value.split(':');
          const hh = Number.parseInt(h ?? '0', 10);
          const mm = Number.parseInt(m ?? '0', 10);
          onChange(
            Number.isFinite(hh) ? Math.max(0, Math.min(23, hh)) : 0,
            Number.isFinite(mm) ? Math.max(0, Math.min(59, mm)) : 0,
          );
        }}
        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
      />
    </div>
  );
}

function WeeklyBody({
  value,
  onChange,
}: {
  value: Extract<PresetSpec, { kind: 'weekly' }>;
  onChange: (next: PresetSpec) => void;
}): React.JSX.Element {
  const toggleDay = (d: Weekday) => {
    const has = value.days.includes(d);
    let next: Weekday[];
    if (has) {
      next = value.days.filter((x) => x !== d);
      if (next.length === 0) {
        // Don't let the user end up with zero days — keep at least one.
        next = [d];
      }
    } else {
      next = [...value.days, d].sort((a, b) => a - b);
    }
    onChange({ kind: 'weekly', days: next, hour: value.hour, minute: value.minute });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Days of week</label>
        <div className="flex gap-1">
          {WEEKDAY_OPTIONS.map((opt) => {
            const selected = value.days.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleDay(opt.value)}
                title={opt.long}
                className={
                  selected
                    ? 'w-8 h-8 rounded-md text-[11px] font-medium border border-amber-500/40 bg-amber-500/10 text-amber-300 transition-colors duration-150'
                    : 'w-8 h-8 rounded-md text-[11px] font-medium border border-zinc-700 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 transition-colors duration-150'
                }
              >
                {opt.short}
              </button>
            );
          })}
        </div>
      </div>
      <TimeOfDayBody
        hour={value.hour}
        minute={value.minute}
        onChange={(hour, minute) => onChange({ kind: 'weekly', days: value.days, hour, minute })}
      />
    </div>
  );
}

function MonthlyBody({
  value,
  onChange,
}: {
  value: Extract<PresetSpec, { kind: 'monthly' }>;
  onChange: (next: PresetSpec) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      <SingleNumberBody
        label="Day of month (1-31)"
        min={1}
        max={31}
        value={value.day}
        onChange={(n) => onChange({ kind: 'monthly', day: n, hour: value.hour, minute: value.minute })}
      />
      <TimeOfDayBody
        hour={value.hour}
        minute={value.minute}
        onChange={(hour, minute) => onChange({ kind: 'monthly', day: value.day, hour, minute })}
      />
    </div>
  );
}

function CustomCronBody({
  value,
  onChange,
}: {
  value: Extract<PresetSpec, { kind: 'custom_cron' }>;
  onChange: (next: PresetSpec) => void;
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-[11px] text-zinc-500 mb-1">Raw 5-field cron expression</label>
      <input
        type="text"
        value={value.expr}
        onChange={(e) => onChange({ kind: 'custom_cron', expr: e.target.value })}
        placeholder="0 9 * * 1-5"
        spellCheck={false}
        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm font-mono text-zinc-200 focus:border-amber-500 outline-none"
      />
      <p className="mt-1 text-[10px] text-zinc-600 leading-relaxed">
        Fields: minute (0-59), hour (0-23), day (1-31), month (1-12), weekday (0-6).
        Use <span className="font-mono">*</span> for any.
      </p>
    </div>
  );
}
