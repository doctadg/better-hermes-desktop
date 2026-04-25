/**
 * Data — backup export / import.
 *
 * Export: pulls models / workspaces / audit from the SQLite cache plus a
 * known set of `electron-store` keys, serializes to JSON, and triggers a
 * synthetic anchor click to download a timestamped file. No filesystem
 * access from the renderer is needed — the Blob URL is enough.
 *
 * Import: reads the user-selected file via a hidden file input, parses
 * JSON, validates the top-level shape, and applies the payload back via
 * the preload (one model.add per row; one storeSet per known key).
 *
 * The "known keys" list is the authoritative surface for v0.2 — everything
 * else (e.g. transient zustand state) is rebuilt at runtime.
 */
import { useCallback, useRef, useState } from 'react';
import type { ModelRow, WorkspaceRow, AuditRow } from '@electron/preload';

const STORE_KEYS = ['theme', 'accent', 'network.proxy', 'network.ipv4Only'] as const;

interface BackupV1 {
  schema: 'hermes-desktop-backup';
  version: 1;
  exportedAt: string;
  store: Record<string, unknown>;
  models: ModelRow[];
  workspaces: WorkspaceRow[];
  audit: AuditRow[];
}

interface OpStatus {
  kind: 'idle' | 'running' | 'ok' | 'error';
  message?: string;
}

function timestampSlug(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isBackup(v: unknown): v is BackupV1 {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.schema === 'hermes-desktop-backup' &&
    o.version === 1 &&
    typeof o.store === 'object' &&
    o.store !== null &&
    Array.isArray(o.models) &&
    Array.isArray(o.workspaces) &&
    Array.isArray(o.audit)
  );
}

export function DataSection(): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportStatus, setExportStatus] = useState<OpStatus>({ kind: 'idle' });
  const [importStatus, setImportStatus] = useState<OpStatus>({ kind: 'idle' });

  const handleExport = useCallback(async () => {
    setExportStatus({ kind: 'running' });
    try {
      const api = window.hermesAPI;
      if (!api) throw new Error('hermesAPI not available');

      const [models, workspaces, audit] = await Promise.all([
        api.models.list(),
        api.workspaces.list(),
        api.audit.list({ limit: 1000 }),
      ]);

      const storeEntries = await Promise.all(
        STORE_KEYS.map(async (k) => [k, await api.storeGet(k)] as const)
      );
      const store: Record<string, unknown> = {};
      for (const [k, v] of storeEntries) {
        store[k] = v;
      }

      const payload: BackupV1 = {
        schema: 'hermes-desktop-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        store,
        models,
        workspaces,
        audit,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `hermes-backup-${timestampSlug()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Defer revoke so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 500);

      setExportStatus({
        kind: 'ok',
        message: `Exported ${models.length} models, ${workspaces.length} workspaces, ${audit.length} audit rows.`,
      });
    } catch (err) {
      setExportStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Export failed',
      });
    }
  }, []);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setImportStatus({ kind: 'running' });
    try {
      const api = window.hermesAPI;
      if (!api) throw new Error('hermesAPI not available');

      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Selected file is not valid JSON');
      }
      if (!isBackup(parsed)) {
        throw new Error('Unrecognized backup format (expected hermes-desktop-backup v1)');
      }

      // Apply store keys.
      for (const k of STORE_KEYS) {
        if (k in parsed.store) {
          await api.storeSet(k, parsed.store[k]);
        }
      }

      // Restore models — `add` upserts on id at the SQL layer.
      for (const m of parsed.models) {
        await api.models.add({
          id: m.id,
          name: m.name,
          provider: m.provider,
          model: m.model,
          base_url: m.base_url,
        });
      }

      // Restore workspaces. The preload layout shape is `unknown` so we
      // re-parse the stored JSON string back into an object before save.
      for (const w of parsed.workspaces) {
        let layout: unknown = w.layout;
        if (typeof layout === 'string') {
          try {
            layout = JSON.parse(layout);
          } catch {
            // Leave as string if it doesn't parse — better than dropping.
          }
        }
        await api.workspaces.save({ id: w.id, name: w.name, layout });
      }

      setImportStatus({
        kind: 'ok',
        message: `Imported ${parsed.models.length} models and ${parsed.workspaces.length} workspaces. Restart for theme changes to apply.`,
      });
    } catch (err) {
      setImportStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Import failed',
      });
    }
  }, []);

  return (
    <div className="space-y-4">
      <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Backup</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Export a JSON snapshot of your model library, workspaces, audit log, and preferences. Sessions and
            messages are kept in a separate database and are not included in this backup.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exportStatus.kind === 'running'}
            className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-zinc-950 font-medium hover:bg-amber-400 disabled:opacity-40"
          >
            {exportStatus.kind === 'running' ? 'Exporting…' : 'Export backup'}
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            disabled={importStatus.kind === 'running'}
            className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            {importStatus.kind === 'running' ? 'Importing…' : 'Import backup'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>

        {exportStatus.kind === 'ok' && (
          <div className="text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">
            {exportStatus.message}
          </div>
        )}
        {exportStatus.kind === 'error' && (
          <div className="text-xs text-red-300 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {exportStatus.message}
          </div>
        )}
        {importStatus.kind === 'ok' && (
          <div className="text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">
            {importStatus.message}
          </div>
        )}
        {importStatus.kind === 'error' && (
          <div className="text-xs text-red-300 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {importStatus.message}
          </div>
        )}
      </section>
    </div>
  );
}

export default DataSection;
