/**
 * Updates — manual check + electron-updater event mirror.
 *
 * Subscribes to the four lifecycle events surfaced by the preload
 * (`onAvailable`, `onProgress`, `onDownloaded`, `onError`) and renders
 * the latest state. The "Check" button calls `updater.check`, and once an
 * update is downloaded the button morphs into "Restart and install" which
 * triggers `updater.install`.
 *
 * No polling; no hidden state — the UI is a pure projection of the
 * latest events received during this mount.
 */
import { useCallback, useEffect, useState } from 'react';
import type { DownloadProgress, UpdateInfo } from '@electron/preload';

type Phase = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

interface State {
  phase: Phase;
  info: UpdateInfo | null;
  progress: DownloadProgress | null;
  errorMessage: string | null;
  lastCheckedAt: number | null;
}

const INITIAL: State = {
  phase: 'idle',
  info: null,
  progress: null,
  errorMessage: null,
  lastCheckedAt: null,
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function UpdatesSection(): React.JSX.Element {
  const [state, setState] = useState<State>(INITIAL);

  // Wire up event subscriptions on mount; teardown on unmount.
  useEffect(() => {
    const updater = window.hermesAPI?.updater;
    if (!updater) return;

    const offChecking = updater.onChecking(() => {
      setState((s) => ({ ...s, phase: 'checking', errorMessage: null }));
    });
    const offAvailable = updater.onAvailable((info) => {
      setState((s) => ({ ...s, phase: 'available', info, errorMessage: null }));
    });
    const offNotAvailable = updater.onNotAvailable((info) => {
      setState((s) => ({ ...s, phase: 'not-available', info, errorMessage: null, lastCheckedAt: Date.now() }));
    });
    const offProgress = updater.onProgress((p) => {
      setState((s) => ({ ...s, phase: 'downloading', progress: p, errorMessage: null }));
    });
    const offDownloaded = updater.onDownloaded((info) => {
      setState((s) => ({ ...s, phase: 'downloaded', info, errorMessage: null }));
    });
    const offError = updater.onError((err) => {
      setState((s) => ({ ...s, phase: 'error', errorMessage: err.message }));
    });

    return (): void => {
      offChecking();
      offAvailable();
      offNotAvailable();
      offProgress();
      offDownloaded();
      offError();
    };
  }, []);

  const handleCheck = useCallback(async () => {
    setState((s) => ({ ...s, phase: 'checking', errorMessage: null }));
    try {
      await window.hermesAPI?.updater.check();
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Check failed',
      }));
    }
  }, []);

  const handleInstall = useCallback(async () => {
    try {
      await window.hermesAPI?.updater.install();
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Install failed',
      }));
    }
  }, []);

  const isChecking = state.phase === 'checking';
  const isDownloaded = state.phase === 'downloaded';
  const isDownloading = state.phase === 'downloading';

  return (
    <div className="space-y-4">
      <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Auto updates</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Hermes Desktop checks for new releases via electron-updater. You can also check manually.
            </p>
          </div>
          <button
            type="button"
            onClick={isDownloaded ? handleInstall : handleCheck}
            disabled={isChecking || isDownloading}
            className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-zinc-950 font-medium hover:bg-amber-400 disabled:opacity-40 shrink-0"
          >
            {isDownloaded
              ? 'Restart and install'
              : isChecking
                ? 'Checking…'
                : isDownloading
                  ? 'Downloading…'
                  : 'Check for updates'}
          </button>
        </div>

        {state.phase === 'available' && state.info && (
          <div className="text-xs text-amber-300 bg-amber-900/20 border border-amber-800 rounded-lg px-3 py-2">
            Update available: <span className="font-mono">{state.info.version ?? 'unknown'}</span>
          </div>
        )}

        {state.phase === 'not-available' && (
          <div className="text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">
            You are on the latest version.
          </div>
        )}

        {isDownloading && state.progress && (
          <div className="space-y-1">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, state.progress.percent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <span>
                {formatBytes(state.progress.transferred)} / {formatBytes(state.progress.total)}
              </span>
              <span>{state.progress.percent.toFixed(1)}%</span>
              <span>{formatBytes(state.progress.bytesPerSecond)}/s</span>
            </div>
          </div>
        )}

        {isDownloaded && state.info && (
          <div className="text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">
            Update <span className="font-mono">{state.info.version ?? ''}</span> downloaded. Click
            &ldquo;Restart and install&rdquo; to apply.
          </div>
        )}

        {state.phase === 'error' && state.errorMessage && (
          <div className="text-xs text-red-300 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {state.errorMessage}
          </div>
        )}
      </section>
    </div>
  );
}

export default UpdatesSection;
