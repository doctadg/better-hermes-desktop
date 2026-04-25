/**
 * Logs — log viewer for agent / gateway / error streams.
 *
 * UI placeholder: the log viewer is wired up as a textarea-based viewer
 * with type filter and search, but real log streaming from the server is
 * not yet connected. Shows a placeholder banner until the backend endpoint
 * lands.
 */
import { useState, useMemo } from 'react';
import { FileText, Search } from 'lucide-react';

type LogType = 'agent' | 'gateway' | 'error';

const LOG_TYPES: { value: LogType; label: string }[] = [
  { value: 'agent', label: 'Agent' },
  { value: 'gateway', label: 'Gateway' },
  { value: 'error', label: 'Error' },
];

const PLACEHOLDER_LINES = [
  '[2025-04-25T14:32:01.234Z] INFO  Agent initialized — session abc123',
  '[2025-04-25T14:32:01.567Z] INFO  Connected to gateway at ws://localhost:8080',
  '[2025-04-25T14:32:02.001Z] DEBUG Streaming response for tool call: read_file',
  '[2025-04-25T14:32:02.891Z] INFO  Tool call completed in 0.89s',
  '[2025-04-25T14:32:03.102Z] WARN  Rate limit approaching — 45/60 requests',
  '[2025-04-25T14:32:05.432Z] INFO  Session abc123 — response finalized',
];

export function LogsSection(): React.JSX.Element {
  const [logType, setLogType] = useState<LogType>('agent');
  const [filter, setFilter] = useState('');

  const filteredLines = useMemo(() => {
    const lines = PLACEHOLDER_LINES; // will be replaced with real data
    if (!filter.trim()) return lines;
    const lower = filter.toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(lower));
  }, [filter]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs text-zinc-400 mb-1">Log Type</label>
            <select
              value={logType}
              onChange={(e) => setLogType(e.target.value as LogType)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 outline-none focus:border-amber-500 appearance-none cursor-pointer"
            >
              {LOG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-[2]">
            <label className="block text-xs text-zinc-400 mb-1">Filter</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search logs…"
                className="w-full pl-8 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 outline-none focus:border-amber-500 placeholder:text-zinc-600"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Log viewer */}
      <section className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-200">
            {LOG_TYPES.find((t) => t.value === logType)?.label} Logs
          </h3>
          <span className="ml-auto text-xs text-zinc-600">
            {filteredLines.length} line{filteredLines.length !== 1 ? 's' : ''}
          </span>
        </div>

        <textarea
          readOnly
          value={filteredLines.join('\n')}
          className="w-full h-64 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-400 font-mono leading-relaxed outline-none resize-y"
          spellCheck={false}
        />

        {/* Placeholder banner */}
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          <span className="text-xs text-zinc-400">
            Log streaming not yet connected to server. Showing placeholder data.
          </span>
        </div>
      </section>
    </div>
  );
}

export default LogsSection;
