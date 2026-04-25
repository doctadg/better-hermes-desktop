import { useState, useEffect, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connection';
import type { ToolsetInfo } from '@/api/types';

export function ToolsScreen() {
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getClient = useConnectionStore((s) => s.getClient);

  const fetchToolsets = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.getToolsets();
      setToolsets(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load toolsets');
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    fetchToolsets();
  }, [fetchToolsets]);

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
        <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Tools</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse-amber">
                <div className="h-4 bg-zinc-800 rounded w-2/3 mb-2" />
                <div className="h-3 bg-zinc-800 rounded w-full mb-1" />
                <div className="h-3 bg-zinc-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-200">Toolsets</h2>
            <span className="text-xs text-zinc-600">{toolsets.length} active</span>
          </div>
          <button
            onClick={fetchToolsets}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
            title="Refresh"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M1 8a7 7 0 0 1 13-3.5M15 8a7 7 0 0 1-13 3.5" />
              <path d="M14 1v4h-4M2 15v-4h4" />
            </svg>
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

        {toolsets.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-zinc-600 text-sm">
            No toolsets available.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {toolsets.map((ts) => (
              <div
                key={ts.name}
                className={`p-3 bg-zinc-900 border rounded-xl transition-colors duration-150 ${
                  ts.enabled ? 'border-emerald-500/30' : 'border-zinc-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-zinc-200 truncate">
                      {ts.label || ts.name}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{ts.description}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] shrink-0 mt-0.5 ${
                    ts.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {ts.enabled ? 'Active' : 'Off'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-600">
                    {ts.tools.length} {ts.tools.length === 1 ? 'tool' : 'tools'}
                  </span>
                  {!ts.configured && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-500">
                      not configured
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
