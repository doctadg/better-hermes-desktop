import { useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '@/stores/connection';
import type { ServerConnection } from '@/api/types';
import { HermesClient } from '@/api/client';

interface ConnectionDialogProps {
  connectionId: string | null;
  onClose: () => void;
}

export function ConnectionDialog({ connectionId, onClose }: ConnectionDialogProps) {
  const connections = useConnectionStore((s) => s.connections);
  const addConnection = useConnectionStore((s) => s.addConnection);
  const updateConnection = useConnectionStore((s) => s.updateConnection);
  const removeConnection = useConnectionStore((s) => s.removeConnection);

  const existing = connectionId
    ? connections.find((c) => c.id === connectionId)
    : null;

  const [label, setLabel] = useState(existing?.label ?? '');
  const [url, setUrl] = useState(existing?.url ?? 'https://');
  const [token, setToken] = useState(existing?.token ?? '');
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset form when connectionId changes
  useEffect(() => {
    if (connectionId) {
      const conn = connections.find((c) => c.id === connectionId);
      if (conn) {
        setLabel(conn.label);
        setUrl(conn.url);
        setToken(conn.token);
      }
    }
  }, [connectionId, connections]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const client = new HermesClient(url, token);
      const health = await client.healthCheck();
      let msg = `Connected! Status: ${health.status}${health.version ? ` (v${health.version})` : ''}`;

      // Check if this is a bridge server
      try {
        const profilesRes = await client.getBridgeProfiles();
        const profileNames = profilesRes.profiles.map((p) => p.name).join(', ');
        msg += ` | Bridge: ${profilesRes.profiles.length} profiles (${profileNames})`;
      } catch {
        // Not a bridge — fine
      }

      setTestResult({ ok: true, message: msg });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setTesting(false);
    }
  }, [url, token]);

  const handleSave = useCallback(() => {
    if (!label.trim() || !url.trim()) return;

    if (existing) {
      updateConnection(existing.id, {
        label: label.trim(),
        url: url.trim(),
        token,
      });
    } else {
      addConnection({
        label: label.trim(),
        url: url.trim(),
        token,
        lastConnected: undefined,
      });
    }
    onClose();
  }, [label, url, token, existing, addConnection, updateConnection, onClose]);

  const handleDelete = useCallback(() => {
    if (!existing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    removeConnection(existing.id);
    onClose();
  }, [existing, confirmDelete, removeConnection, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  const isValid = label.trim().length > 0 && url.trim().length > 3;

  return (
    <div
      className="modal-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal-content w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">
            {existing ? 'Edit Connection' : 'New Connection'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors duration-150"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My Hermes Server"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors duration-150 text-sm"
              autoFocus
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Server URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://localhost:8080"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors duration-150 text-sm font-mono"
            />
          </div>

          {/* Token */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">API Token</label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 pr-10 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors duration-150 text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors duration-150"
              >
                {showToken ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={`text-sm px-3 py-2 rounded-lg ${
                testResult.ok
                  ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-800'
                  : 'bg-red-900/20 text-red-400 border border-red-800'
              }`}
            >
              {testResult.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            {existing && (
              <button
                onClick={handleDelete}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors duration-150 ${
                  confirmDelete
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'text-red-400 hover:bg-red-900/20 hover:text-red-300'
                }`}
              >
                {confirmDelete ? 'Confirm Delete' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTest}
              disabled={!isValid || testing}
              className="px-3 py-1.5 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid}
              className="px-4 py-1.5 text-sm rounded-lg bg-amber-500 text-zinc-950 font-medium hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
