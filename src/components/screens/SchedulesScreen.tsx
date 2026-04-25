import { useState, useEffect, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connection';
import type { CronJob } from '@/api/types';

const SCHEDULE_PRESETS = [
  { label: 'Every 5 min', value: '*/5 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily', value: '0 0 * * *' },
  { label: 'Weekly', value: '0 0 * * 0' },
];

export function SchedulesScreen() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create modal state
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newSchedule, setNewSchedule] = useState('0 * * * *');
  const [newDeliver, setNewDeliver] = useState('');
  const [customCron, setCustomCron] = useState('');
  const [useCustomCron, setUseCustomCron] = useState(false);
  const [creating, setCreating] = useState(false);

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const getClient = useConnectionStore((s) => s.getClient);

  const fetchJobs = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.getCronJobs();
      setJobs(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleCreate = useCallback(async () => {
    const client = getClient();
    if (!client || !newName.trim() || !newPrompt.trim()) return;
    setCreating(true);
    try {
      const schedule = useCustomCron ? customCron : newSchedule;
      await client.createCronJob({
        name: newName.trim(),
        prompt: newPrompt.trim(),
        schedule,
        deliver: newDeliver || undefined,
      });
      setShowCreateModal(false);
      setNewName('');
      setNewPrompt('');
      setNewSchedule('0 * * * *');
      setNewDeliver('');
      setCustomCron('');
      setUseCustomCron(false);
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setCreating(false);
    }
  }, [getClient, newName, newPrompt, newSchedule, newDeliver, customCron, useCustomCron, fetchJobs]);

  const handleDelete = useCallback(async (id: string) => {
    const client = getClient();
    if (!client) return;
    setActionLoading(id);
    try {
      await client.deleteCronJob(id);
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    } finally {
      setActionLoading(null);
    }
  }, [getClient, fetchJobs]);

  const handleTogglePause = useCallback(async (job: CronJob) => {
    const client = getClient();
    if (!client) return;
    setActionLoading(job.id);
    try {
      if (job.enabled) {
        await client.pauseCronJob(job.id);
      } else {
        await client.resumeCronJob(job.id);
      }
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    } finally {
      setActionLoading(null);
    }
  }, [getClient, fetchJobs]);

  const handleTrigger = useCallback(async (id: string) => {
    const client = getClient();
    if (!client) return;
    setActionLoading(id);
    try {
      await client.triggerCronJob(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger schedule');
    } finally {
      setActionLoading(null);
    }
  }, [getClient]);

  const formatTime = (iso: string | null) => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  };

  const stateLabel = (state: string, enabled: boolean, pausedAt: string | null) => {
    if (pausedAt) return { text: 'Paused', cls: 'bg-zinc-800 text-zinc-500' };
    if (!enabled) return { text: 'Disabled', cls: 'bg-red-500/10 text-red-400' };
    switch (state) {
      case 'running': return { text: 'Running', cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' };
      case 'success': return { text: 'OK', cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' };
      case 'error': return { text: 'Error', cls: 'bg-red-500/10 text-red-400 border border-red-500/20' };
      default: return { text: 'Active', cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' };
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        <span className="inline-block w-4 h-4 border border-zinc-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading schedules...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-200">Schedules</h2>
            <span className="text-xs text-zinc-600">{jobs.length} jobs</span>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-zinc-950 font-medium rounded-lg transition-colors duration-150"
          >
            + New Schedule
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 mb-3">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-300">x</button>
          </div>
        )}

        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-600 text-sm gap-2">
            <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" className="text-zinc-700">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 4.5V8l2.5 1.5" />
            </svg>
            No scheduled jobs yet.
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const badge = stateLabel(job.state, job.enabled, job.paused_at);
              return (
                <div
                  key={job.id}
                  className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors duration-150"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-medium text-zinc-200 truncate">{job.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] shrink-0 ${badge.cls}`}>
                          {badge.text}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 line-clamp-1">{job.prompt}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-zinc-600 mb-1">
                    <span className="font-mono">{job.schedule_display}</span>
                    {job.deliver && (
                      <span className="text-zinc-500">via {job.deliver}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-zinc-600 mb-2">
                    <span>Last: {formatTime(job.last_run_at)}</span>
                    <span>Next: {formatTime(job.next_run_at)}</span>
                    {job.last_error && (
                      <span className="text-red-400 truncate max-w-[200px]" title={job.last_error}>
                        Error: {job.last_error}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTrigger(job.id)}
                      disabled={actionLoading === job.id}
                      className="px-2 py-1 text-[11px] bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-md transition-colors duration-150 disabled:opacity-40"
                      title="Run now"
                    >
                      {actionLoading === job.id ? '...' : 'Run Now'}
                    </button>
                    <button
                      onClick={() => handleTogglePause(job)}
                      disabled={actionLoading === job.id}
                      className="px-2 py-1 text-[11px] bg-zinc-800 text-zinc-400 hover:bg-zinc-700 rounded-md transition-colors duration-150 disabled:opacity-40"
                    >
                      {job.paused_at ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      onClick={() => handleDelete(job.id)}
                      disabled={actionLoading === job.id}
                      className="px-2 py-1 text-[11px] bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-md transition-colors duration-150 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 max-w-md w-full mx-4 animate-fade-in-up shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">Create Schedule</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
                  placeholder="My scheduled task"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Prompt</label>
                <textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 resize-none focus:border-amber-500 outline-none"
                  rows={3}
                  placeholder="What should the agent do?"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Schedule</label>
                <div className="flex gap-1 mb-2">
                  {!useCustomCron && SCHEDULE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => setNewSchedule(preset.value)}
                      className={`px-2 py-1 text-[11px] rounded-md border transition-colors duration-150 ${
                        newSchedule === preset.value
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setUseCustomCron(!useCustomCron)}
                  className="text-[11px] text-amber-400 hover:text-amber-300 mb-1"
                >
                  {useCustomCron ? 'Use presets' : 'Custom cron expression'}
                </button>
                {useCustomCron && (
                  <input
                    type="text"
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono focus:border-amber-500 outline-none mt-1"
                    placeholder="*/5 * * * *"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Deliver to (optional)</label>
                <input
                  type="text"
                  value={newDeliver}
                  onChange={(e) => setNewDeliver(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
                  placeholder="telegram, discord, etc."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !newPrompt.trim() || (useCustomCron && !customCron.trim())}
                className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-zinc-950 font-medium rounded-lg transition-colors duration-150 disabled:opacity-40"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
