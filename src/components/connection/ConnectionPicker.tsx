import { useState, useRef, useEffect, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connection';
import type { ModelsResponse } from '@/api/types';

interface ConnectionPickerProps {
  onAddConnection: (connectionId?: string) => void;
}

export function ConnectionPicker({ onAddConnection }: ConnectionPickerProps) {
  const connections = useConnectionStore((s) => s.connections);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const healthStatus = useConnectionStore((s) => s.healthStatus);
  const isConnecting = useConnectionStore((s) => s.isConnecting);
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection);
  const getClient = useConnectionStore((s) => s.getClient);

  const [open, setOpen] = useState(false);
  const [modelName, setModelName] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const activeHealth = activeConnectionId ? healthStatus[activeConnectionId] : null;
  const isConnected = activeHealth?.status === 'ok' || activeHealth?.status === 'healthy';

  // Fetch model name when active connection changes
  useEffect(() => {
    if (!activeConnectionId) {
      setModelName('');
      return;
    }
    const client = getClient();
    if (!client) {
      setModelName('');
      return;
    }
    client
      .listModels()
      .then((res: ModelsResponse) => {
        if (res.data && res.data.length > 0) {
          setModelName(res.data[0].id);
        }
      })
      .catch(() => {
        setModelName('');
      });
  }, [activeConnectionId, getClient]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(
    async (id: string) => {
      setOpen(false);
      await setActiveConnection(id);
    },
    [setActiveConnection]
  );

  const statusDot = activeConnectionId ? (
    isConnected ? (
      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
    ) : (
      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
    )
  ) : (
    <span className="w-2 h-2 rounded-full bg-zinc-600 shrink-0" />
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-zinc-800 text-sm transition-colors duration-150 max-w-[280px]"
      >
        {statusDot}
        <span className="truncate text-zinc-200">
          {isConnecting
            ? 'Connecting...'
            : activeConn
            ? activeConn.label
            : 'No connection'}
        </span>
        {modelName && (
          <span className="text-xs text-zinc-500 truncate hidden sm:inline">{modelName}</span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`shrink-0 text-zinc-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 py-1 animate-fade-in">
          {connections.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-zinc-500">
              No connections yet
            </div>
          )}
          {connections.map((conn) => {
            const isActive = conn.id === activeConnectionId;
            const health = healthStatus[conn.id];
            const connected = health?.status === 'ok' || health?.status === 'healthy';

            return (
              <button
                key={conn.id}
                onClick={() => handleSelect(conn.id)}
                onDoubleClick={() => onAddConnection(conn.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-150 ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isActive
                      ? connected
                        ? 'bg-emerald-500'
                        : 'bg-red-500'
                      : 'bg-zinc-600'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{conn.label}</div>
                  <div className="text-xs text-zinc-500 truncate">{conn.url}</div>
                </div>
                {isActive && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 shrink-0">
                    <path d="M3 8l4 4 6-7" />
                  </svg>
                )}
              </button>
            );
          })}

          <div className="border-t border-zinc-800 mt-1 pt-1">
            <button
              onClick={() => {
                setOpen(false);
                onAddConnection();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors duration-150"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M7 1v12M1 7h12" />
              </svg>
              Add Connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
