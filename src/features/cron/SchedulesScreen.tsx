/**
 * SchedulesScreen — master-detail orchestrator for cron jobs.
 *
 * Left panel: scrollable job list with inline status badges and quick actions.
 * Right panel: the full CronJobEditor for create/edit workflows.
 *
 * Uses HermesClient via useConnectionStore for all API calls.
 * Auto-refreshes the job list every 30 seconds while mounted.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Pencil,
} from 'lucide-react';

import { useConnectionStore } from '@/stores/connection';
import type { CronJob } from '@/api/types';
import { CronJobEditor } from './CronJobEditor';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadge(job: CronJob): { label: string; cls: string; icon: React.ReactNode } {
  if (job.paused_at || !job.enabled) {
    return {
      label: 'Paused',
      cls: 'bg-zinc-800 text-zinc-500',
      icon: <Pause className="w-3 h-3" />,
    };
  }
  if (job.last_error) {
    return {
      label: 'Error',
      cls: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
      icon: <XCircle className="w-3 h-3" />,
    };
  }
  if (job.state === 'running') {
    return {
      label: 'Running',
      cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      icon: <span className="inline-block w-2.5 h-2.5 border border-amber-500 border-t-transparent rounded-full animate-spin" />,
    };
  }
  if (job.last_status === 'success' || job.state === 'success') {
    return {
      label: 'Active',
      cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      icon: <CheckCircle2 className="w-3 h-3" />,
    };
  }
  return {
    label: 'Active',
    cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    icon: <CheckCircle2 className="w-3 h-3" />,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SchedulesScreen(): React.JSX.Element {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getClient = useConnectionStore((s) => s.getClient);

  // ── Fetch jobs ──

  const fetchJobs = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    try {
      const res = await client.getCronJobs();
      setJobs(Array.isArray(res) ? res : []);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Initial fetch
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Auto-refresh every 30s
  useEffect(() => {
    refreshTimerRef.current = setInterval(fetchJobs, 30_000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchJobs]);

  // ── Derived state ──

  const selectedJob = creatingNew
    ? null
    : jobs.find((j) => j.id === selectedJobId) ?? null;

  // ── List actions ──

  const handleSelectJob = useCallback((id: string) => {
    setSelectedJobId(id);
    setCreatingNew(false);
  }, []);

  const handleNewJob = useCallback(() => {
    setCreatingNew(true);
    setSelectedJobId(null);
  }, []);

  const handleSaved = useCallback(
    (_job: CronJob) => {
      // After save, refetch and keep the editor pointed at the saved job
      setCreatingNew(false);
      fetchJobs().then(() => {
        // We'll let the refetch update the list; keep selectedJobId as-is
        // or set it if we just created a new one
        if (_job.id && !selectedJobId) {
          setSelectedJobId(_job.id);
        }
      });
    },
    [fetchJobs, selectedJobId],
  );

  const handleDeleted = useCallback(
    (id: string) => {
      setSelectedJobId(null);
      setCreatingNew(false);
      fetchJobs();
    },
    [fetchJobs],
  );

  const handleTogglePause = useCallback(
    async (job: CronJob) => {
      const client = getClient();
      if (!client) return;
      setActionLoading(job.id);
      try {
        if (job.enabled && !job.paused_at) {
          await client.pauseCronJob(job.id);
        } else {
          await client.resumeCronJob(job.id);
        }
        await fetchJobs();
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Failed to toggle pause');
      } finally {
        setActionLoading(null);
      }
    },
    [getClient, fetchJobs],
  );

  const handleTrigger = useCallback(
    async (id: string) => {
      const client = getClient();
      if (!client) return;
      setActionLoading(id);
      try {
        await client.triggerCronJob(id);
        await fetchJobs();
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Failed to trigger job');
      } finally {
        setActionLoading(null);
      }
    },
    [getClient, fetchJobs],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const client = getClient();
      if (!client) return;
      if (!window.confirm('Delete this schedule? This cannot be undone.')) return;
      setActionLoading(id);
      try {
        await client.deleteCronJob(id);
        if (selectedJobId === id) {
          setSelectedJobId(null);
          setCreatingNew(false);
        }
        await fetchJobs();
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Failed to delete job');
      } finally {
        setActionLoading(null);
      }
    },
    [getClient, fetchJobs, selectedJobId],
  );

  // ── Render ──

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading schedules…
      </div>
    );
  }

  return (
    <div className="h-full flex bg-zinc-950">
      {/* ── Left panel: job list ── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-zinc-800">
        {/* Header */}
        <div className="shrink-0 px-3 py-2.5 border-b border-zinc-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            <h2 className="text-sm font-semibold text-zinc-200 truncate">Schedules</h2>
            <span className="text-[11px] text-zinc-600 shrink-0">{jobs.length}</span>
          </div>
          <button
            onClick={handleNewJob}
            className="flex items-center gap-1 px-2 py-1 text-[11px] bg-amber-500 hover:bg-amber-600 text-zinc-950 font-medium rounded-lg transition-colors duration-150 shrink-0"
          >
            <Plus className="w-3 h-3" />
            New Job
          </button>
        </div>

        {/* Error */}
        {listError && (
          <div className="mx-3 mt-2 flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5">
            <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
            <span className="flex-1 text-[11px] text-rose-300">{listError}</span>
            <button
              onClick={() => setListError(null)}
              className="text-rose-400 hover:text-rose-200 text-xs leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* Job list */}
        <div className="flex-1 overflow-y-auto">
          {jobs.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-600 text-xs gap-2 px-4 text-center">
              <Clock className="w-6 h-6 text-zinc-700" />
              <p>No scheduled jobs yet.</p>
              <p className="text-zinc-700">Click "New Job" to create one.</p>
            </div>
          ) : (
            <div className="py-1">
              {jobs.map((job) => {
                const badge = statusBadge(job);
                const isSelected = selectedJobId === job.id && !creatingNew;
                const isBusy = actionLoading === job.id;
                return (
                  <div
                    key={job.id}
                    onClick={() => handleSelectJob(job.id)}
                    className={`group px-3 py-2.5 cursor-pointer border-l-2 transition-colors duration-100 ${
                      isSelected
                        ? 'bg-zinc-900 border-l-amber-500'
                        : 'border-l-transparent hover:bg-zinc-900/60'
                    }`}
                  >
                    {/* Row 1: name + badge */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-zinc-200 truncate flex-1 min-w-0">
                        {job.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] shrink-0 ${badge.cls}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </div>

                    {/* Row 2: schedule display */}
                    <div className="text-[11px] text-zinc-500 font-mono mb-1 truncate">
                      {job.schedule_display || job.schedule?.expr || '—'}
                    </div>

                    {/* Row 3: next run + last status */}
                    <div className="flex items-center gap-3 text-[11px] text-zinc-600 mb-1.5">
                      <span>Next: {formatTime(job.next_run_at)}</span>
                      {job.last_status && (
                        <span
                          className={
                            job.last_status === 'success'
                              ? 'text-emerald-500'
                              : job.last_status === 'failed' || job.last_status === 'error'
                                ? 'text-rose-400'
                                : ''
                          }
                        >
                          Last: {job.last_status}
                        </span>
                      )}
                    </div>

                    {/* Row 4: last error (if any) */}
                    {job.last_error && (
                      <div
                        className="text-[10px] text-rose-400/80 truncate mb-1.5"
                        title={job.last_error}
                      >
                        {job.last_error}
                      </div>
                    )}

                    {/* Row 5: action buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePause(job);
                        }}
                        disabled={isBusy}
                        title={job.enabled && !job.paused_at ? 'Pause' : 'Resume'}
                        className="p-1 rounded-md text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
                      >
                        {job.enabled && !job.paused_at ? (
                          <Pause className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTrigger(job.id);
                        }}
                        disabled={isBusy}
                        title="Run now"
                        className="p-1 rounded-md text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3 h-3 ${isBusy ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectJob(job.id);
                        }}
                        title="Edit"
                        className="p-1 rounded-md text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition-colors duration-150"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(job.id);
                        }}
                        disabled={isBusy}
                        title="Delete"
                        className="p-1 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: editor ── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedJob || creatingNew ? (
          <CronJobEditor
            job={creatingNew ? null : selectedJob}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-sm gap-3">
            <Clock className="w-8 h-8 text-zinc-800" />
            <div className="text-center">
              <p className="text-zinc-500">Select a schedule to edit</p>
              <p className="text-xs text-zinc-700 mt-1">or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
