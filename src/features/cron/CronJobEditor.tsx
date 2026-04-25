/**
 * CronJobEditor — right-pane form for creating or updating a cron job.
 *
 * Stateless w.r.t. the active job — the parent (`CronScreen`) hands us
 * either an existing `CronJob` or `null`, plus an `onSaved` callback that
 * triggers a refetch and switch to the saved row. We keep one local
 * `draft` state initialised from the prop on every job change, and
 * submit it through `client.createCronJob` / `client.patchCronJob`.
 *
 * The schedule builder is delegated to `<PresetTabs>`. Other fields
 * (name, prompt, skills CSV, model, provider, base URL, delivery target,
 * timezone) are plain inputs. Models are pulled from the preload
 * `window.hermesAPI.models` bridge — same source the chat picker uses,
 * so users see the same library here as everywhere else. If the bridge
 * is unavailable (e.g. running in a renderer-only dev mode) the model
 * field falls back to a free-text input.
 *
 * No new IPCs: every server interaction goes through the existing
 * `HermesClient` methods (`createCronJob`, `patchCronJob`,
 * `pauseCronJob`, `resumeCronJob`, `triggerCronJob`, `deleteCronJob`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Check,
} from 'lucide-react';

import { useConnectionStore } from '@/stores/connection';
import type { CronJob, CronJobCreate } from '@/api/types';
import { PresetTabs } from './PresetTabs';
import { presetToCron, cronToPreset } from './cronParser';
import {
  DELIVERY_TARGETS,
  DELIVERY_TARGET_LABELS,
  emptyDraft,
  type CronJobDraft,
  type DeliveryTarget,
  type PresetSpec,
} from './types';

/**
 * Narrow shape of `window.hermesAPI.models` — the global type in
 * `src/api/types.ts` does not yet include the models bridge, so we cast
 * through `unknown` here. Same pattern as `useModels.ts`.
 */
interface ModelRowMin {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string | null;
}

function getModelsBridge(): { list: () => Promise<ModelRowMin[]> } | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { hermesAPI?: { models?: { list: () => Promise<ModelRowMin[]> } } }).hermesAPI;
  return api?.models ?? null;
}

interface CronJobEditorProps {
  /** When non-null we're editing an existing job; null = creating new. */
  job: CronJob | null;
  /** Called after a successful create/update with the saved job. */
  onSaved: (job: CronJob) => void;
  /** Called after delete with the removed job's id. */
  onDeleted: (id: string) => void;
  /** Toggle visual loading state on the parent's list refresh. */
  onActionStart?: () => void;
  onActionEnd?: () => void;
}

/** Convert an existing job into editor draft form. */
function jobToDraft(job: CronJob): CronJobDraft {
  const expr = (job.schedule?.expr ?? job.schedule_display ?? '').trim();
  const parsed = cronToPreset(expr);
  return {
    name: job.name,
    prompt: job.prompt ?? '',
    skillsText: (job.skills ?? []).join(', '),
    model: job.model ?? '',
    provider: job.provider ?? '',
    baseUrl: job.base_url ?? '',
    delivery: (job.deliver ?? 'local') as DeliveryTarget,
    timezone: job.schedule?.tz ?? 'UTC',
    schedule: parsed ?? { kind: 'custom_cron', expr },
  };
}

/** Build the wire-format payload accepted by createCronJob / patchCronJob. */
function buildPayload(draft: CronJobDraft): CronJobCreate & {
  skills?: string[];
  model?: string | null;
  provider?: string | null;
  base_url?: string | null;
  timezone?: string | null;
} {
  const skills = draft.skillsText
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const expr = presetToCron(draft.schedule);
  const tz = draft.timezone.trim();

  const payload: CronJobCreate & {
    skills?: string[];
    model?: string | null;
    provider?: string | null;
    base_url?: string | null;
    timezone?: string | null;
  } = {
    name: draft.name.trim(),
    prompt: draft.prompt.trim(),
    schedule: expr,
  };

  if (draft.delivery) payload.deliver = draft.delivery;
  if (skills.length > 0) payload.skills = skills;
  if (draft.model.trim()) payload.model = draft.model.trim();
  if (draft.provider.trim()) payload.provider = draft.provider.trim();
  if (draft.baseUrl.trim()) payload.base_url = draft.baseUrl.trim();
  if (tz) payload.timezone = tz;

  return payload;
}

/** Local validation — returns the first error or null. */
function validateDraft(draft: CronJobDraft): string | null {
  if (draft.name.trim().length === 0) return 'Name is required.';
  if (draft.prompt.trim().length === 0) return 'Prompt is required.';
  const expr = presetToCron(draft.schedule);
  if (expr.length === 0) return 'Schedule is empty.';
  if (draft.schedule.kind === 'custom_cron') {
    const fields = expr.split(/\s+/).filter(Boolean);
    if (fields.length !== 5) return 'Custom cron must be a 5-field expression.';
  }
  return null;
}

export function CronJobEditor({
  job,
  onSaved,
  onDeleted,
  onActionStart,
  onActionEnd,
}: CronJobEditorProps): React.JSX.Element {
  const getClient = useConnectionStore((s) => s.getClient);
  const [draft, setDraft] = useState<CronJobDraft>(() => (job ? jobToDraft(job) : emptyDraft()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelRowMin[]>([]);

  // Reload draft whenever the active job changes (including null -> new).
  useEffect(() => {
    setDraft(job ? jobToDraft(job) : emptyDraft());
    setError(null);
  }, [job]);

  // Pull the model library once on mount; tolerate missing bridge.
  useEffect(() => {
    let cancelled = false;
    const bridge = getModelsBridge();
    if (!bridge) return;
    bridge
      .list()
      .then((rows) => {
        if (!cancelled) setModels(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        // Silent — fall back to free-text input.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const validationError = useMemo(() => validateDraft(draft), [draft]);

  const handleScheduleChange = useCallback((next: PresetSpec) => {
    setDraft((prev) => ({ ...prev, schedule: next }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const client = getClient();
    if (!client) {
      setError('No active connection.');
      return;
    }
    const v = validateDraft(draft);
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    setError(null);
    onActionStart?.();
    try {
      const payload = buildPayload(draft);
      let saved: CronJob;
      if (job) {
        // Server's PATCH endpoint expects the same shape; cast to satisfy the
        // narrow `Partial<CronJob>` type.
        saved = await client.patchCronJob(job.id, payload as unknown as Partial<CronJob>);
      } else {
        saved = await client.createCronJob(payload);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSubmitting(false);
      onActionEnd?.();
    }
  }, [draft, getClient, job, onActionEnd, onActionStart, onSaved]);

  const handleDelete = useCallback(async () => {
    if (!job) return;
    const client = getClient();
    if (!client) return;
    if (!window.confirm(`Delete schedule "${job.name}"? This cannot be undone.`)) return;
    setSubmitting(true);
    setError(null);
    onActionStart?.();
    try {
      await client.deleteCronJob(job.id);
      onDeleted(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    } finally {
      setSubmitting(false);
      onActionEnd?.();
    }
  }, [getClient, job, onActionEnd, onActionStart, onDeleted]);

  const handlePauseResume = useCallback(async () => {
    if (!job) return;
    const client = getClient();
    if (!client) return;
    setSubmitting(true);
    setError(null);
    onActionStart?.();
    try {
      if (job.paused_at || !job.enabled) {
        await client.resumeCronJob(job.id);
      } else {
        await client.pauseCronJob(job.id);
      }
      // Re-fetch by hand: the server returns void, so we have to refresh
      // via the parent. Easiest path: just emit `onSaved` with a stale
      // job and let the parent refetch the whole list.
      onSaved(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    } finally {
      setSubmitting(false);
      onActionEnd?.();
    }
  }, [getClient, job, onActionEnd, onActionStart, onSaved]);

  const handleTrigger = useCallback(async () => {
    if (!job) return;
    const client = getClient();
    if (!client) return;
    setSubmitting(true);
    setError(null);
    onActionStart?.();
    try {
      await client.triggerCronJob(job.id);
      onSaved(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger schedule');
    } finally {
      setSubmitting(false);
      onActionEnd?.();
    }
  }, [getClient, job, onActionEnd, onActionStart, onSaved]);

  const isExisting = job !== null;
  const isPaused = !!job && (job.paused_at !== null || !job.enabled);

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <div className="max-w-2xl mx-auto px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarClock className="w-4 h-4 text-amber-500 shrink-0" />
            <h2 className="text-sm font-semibold text-zinc-200 truncate">
              {isExisting ? `Edit "${job.name}"` : 'New Schedule'}
            </h2>
          </div>
          {isExisting && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleTrigger}
                disabled={submitting}
                title="Run now"
                className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-amber-300 hover:border-amber-500/40 transition-colors duration-150 disabled:opacity-40"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handlePauseResume}
                disabled={submitting}
                title={isPaused ? 'Resume' : 'Pause'}
                className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-amber-300 hover:border-amber-500/40 transition-colors duration-150 disabled:opacity-40"
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                title="Delete"
                className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-rose-300 hover:border-rose-500/40 transition-colors duration-150 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-rose-300">{error}</div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-400 hover:text-rose-200 text-xs"
            >
              ×
            </button>
          </div>
        )}

        {/* Name */}
        <Field label="Name" required>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Daily standup digest"
            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
          />
        </Field>

        {/* Prompt */}
        <Field label="Prompt" required>
          <textarea
            value={draft.prompt}
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            placeholder="What should the agent do?"
            rows={4}
            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 resize-y focus:border-amber-500 outline-none font-mono"
          />
        </Field>

        {/* Schedule builder */}
        <Field label="Schedule" required>
          <PresetTabs value={draft.schedule} onChange={handleScheduleChange} tz={draft.timezone} />
        </Field>

        {/* Skills */}
        <Field label="Skills (comma-separated)">
          <input
            type="text"
            value={draft.skillsText}
            onChange={(e) => setDraft({ ...draft, skillsText: e.target.value })}
            placeholder="web-search, summarise"
            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
          />
        </Field>

        {/* Model */}
        <Field label="Model">
          {models.length > 0 ? (
            <select
              value={draft.model}
              onChange={(e) => {
                const sel = models.find((m) => m.model === e.target.value);
                setDraft({
                  ...draft,
                  model: e.target.value,
                  // Auto-fill provider/baseUrl from the selected library row when blank
                  provider: draft.provider || (sel?.provider ?? ''),
                  baseUrl: draft.baseUrl || (sel?.base_url ?? ''),
                });
              }}
              className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
            >
              <option value="">(use server default)</option>
              {models.map((m) => (
                <option key={m.id} value={m.model}>
                  {m.name} — {m.model}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              placeholder="claude-sonnet-4-5 (or leave blank)"
              className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
            />
          )}
        </Field>

        {/* Provider + Base URL on one row */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider">
            <input
              type="text"
              value={draft.provider}
              onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
              placeholder="anthropic"
              className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
            />
          </Field>
          <Field label="Base URL">
            <input
              type="text"
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              placeholder="https://api.anthropic.com"
              className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
            />
          </Field>
        </div>

        {/* Delivery target + Timezone on one row */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Delivery target">
            <select
              value={draft.delivery}
              onChange={(e) => setDraft({ ...draft, delivery: e.target.value as DeliveryTarget })}
              className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
            >
              {DELIVERY_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {DELIVERY_TARGET_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timezone">
            <input
              type="text"
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              placeholder="UTC"
              className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono focus:border-amber-500 outline-none"
            />
          </Field>
        </div>

        {/* Submit row */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-800">
          <div className="text-[11px] text-zinc-600">
            {validationError ? (
              <span className="text-amber-500">{validationError}</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-emerald-500" /> Ready to save
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || validationError !== null}
            className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : isExisting ? 'Save changes' : 'Create schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-[11px] text-zinc-500 mb-1">
        {label}
        {required && <span className="text-amber-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
