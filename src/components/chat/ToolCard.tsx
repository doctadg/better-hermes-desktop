import { useState, useCallback, useMemo } from 'react';
import type { ToolCallInfo } from '@/api/types';

interface ToolCardProps {
  toolCall: ToolCallInfo;
}

// Tool name to emoji/icon mapping
const TOOL_ICONS: Record<string, string> = {
  terminal: '💻',
  shell: '💻',
  bash: '💻',
  read_file: '📄',
  search_files: '🔍',
  write_file: '✏️',
  patch: '🔧',
  terminal_background: '💻',
  browser: '🌐',
  think: '💭',
  code: '⚡',
  default: '🛠️',
};

function getToolIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(TOOL_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return TOOL_ICONS.default;
}

function getToolDisplayLabel(name: string): string {
  // Convert snake_case to Title Case
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ToolCard({ toolCall }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isRunning = toolCall.status === 'running';
  const isCompleted = toolCall.status === 'completed';
  const isFailed = toolCall.status === 'failed';

  const toolIcon = useMemo(() => getToolIcon(toolCall.name), [toolCall.name]);
  const displayLabel = useMemo(() => getToolDisplayLabel(toolCall.name), [toolCall.name]);

  const statusIndicator = useMemo(() => {
    if (isRunning) {
      return (
        <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      );
    }
    if (isCompleted) {
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-emerald-400">
          <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.15" />
          <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-red-400">
        <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.15" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }, [isRunning, isCompleted, isFailed]);

  const durationText = useMemo(() => {
    if (!toolCall.duration_s) return '';
    if (toolCall.duration_s < 1) return `${Math.round(toolCall.duration_s * 1000)}ms`;
    return `${toolCall.duration_s.toFixed(1)}s`;
  }, [toolCall.duration_s]);

  const handleToggle = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  // Auto-expand running tools
  const shouldExpand = expanded || isRunning;

  return (
    <div
      className={`rounded-lg border transition-all duration-150 ${
        isRunning
          ? 'tool-card-running animate-border-pulse-amber'
          : isFailed
            ? 'tool-card-failed'
            : isCompleted
              ? 'tool-card-completed'
              : 'border-zinc-800 bg-zinc-900/50'
      }`}
    >
      {/* Header - clickable to toggle */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/30 transition-colors duration-150 rounded-lg"
      >
        {/* Tool icon */}
        <span className="tool-card-icon text-sm">
          {toolIcon}
        </span>

        {statusIndicator}

        {/* Tool name */}
        <span className="text-sm font-medium text-zinc-200 truncate flex-1">
          {displayLabel}
        </span>

        {/* Status badge */}
        {isRunning && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            running
          </span>
        )}
        {isCompleted && durationText && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            {durationText}
          </span>
        )}
        {isFailed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
            failed
          </span>
        )}

        {/* Expand chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`shrink-0 text-zinc-500 transition-transform duration-200 ${shouldExpand ? 'rotate-180' : ''}`}
        >
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>

      {/* Collapsed preview (only when not expanded and not running) */}
      {!shouldExpand && (toolCall.argsPreview || toolCall.preview || toolCall.summary) && (
        <div className="px-3 pb-2">
          {/* Show args preview */}
          {toolCall.argsPreview && isCompleted && (
            <div className="text-xs text-zinc-400 tool-card-preview mb-0.5">
              <span className="text-zinc-500">called</span> {toolCall.argsPreview}
            </div>
          )}
          {/* Show output preview */}
          {(toolCall.summary || toolCall.preview) && (
            <div className={`text-xs tool-card-preview ${isFailed ? 'text-red-400/70' : 'text-zinc-500'}`}>
              {toolCall.summary || toolCall.preview}
            </div>
          )}
        </div>
      )}

      {/* Expanded content */}
      {shouldExpand && (
        <div className="animate-expand px-3 pb-3 pt-0">
          <div className="border-t border-zinc-800/60 pt-2">
            {/* Tool arguments section */}
            {toolCall.args && (
              <div className="mb-2">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 font-medium">Arguments</div>
                <ToolArgsDisplay args={toolCall.args} />
              </div>
            )}

            {/* Preview section */}
            {toolCall.preview && (
              <div className="mb-2 border-t border-zinc-800/40 pt-2">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 font-medium">Preview</div>
                <div className="text-sm text-zinc-300 leading-relaxed">{toolCall.preview}</div>
              </div>
            )}

            {/* Summary / Result section */}
            {toolCall.summary && (
              <div className="border-t border-zinc-800/40 pt-2">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 font-medium">
                  {isFailed ? 'Error' : 'Result'}
                </div>
                <div
                  className={`text-xs rounded-md p-2.5 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed ${
                    isFailed
                      ? 'bg-red-950/30 text-red-300 border border-red-500/10'
                      : 'bg-zinc-950 text-zinc-300 border border-zinc-800'
                  }`}
                >
                  {toolCall.summary}
                </div>
              </div>
            )}

            {/* Error */}
            {isFailed && toolCall.error && (
              <div className="border-t border-zinc-800/40 pt-2">
                <div className="text-xs text-red-400/80 font-mono">{toolCall.error}</div>
              </div>
            )}

            {/* Empty state */}
            {!toolCall.summary && !toolCall.preview && !toolCall.args && (
              <div className="text-sm text-zinc-500 italic flex items-center gap-2">
                {isRunning ? (
                  <>
                    <span className="inline-block w-2 h-2 border border-amber-500/60 border-t-transparent rounded-full animate-spin" />
                    Running...
                  </>
                ) : (
                  'No output'
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolArgsDisplay({ args }: { args: string }) {
  const [expanded, setExpanded] = useState(false);
  
  try {
    const parsed = JSON.parse(args);
    const entries = Object.entries(parsed);
    if (entries.length === 0) return null;

    // If expanded, show all key-values
    if (expanded) {
      return (
        <div className="space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-xs">
              <span className="text-zinc-500 font-mono shrink-0">{key}:</span>
              <span className="text-zinc-300 font-mono break-all">
                {formatArgValue(value)}
              </span>
            </div>
          ))}
        </div>
      );
    }

    // Collapsed: show first 3 key-vals
    const shown = entries.slice(0, 3);
    return (
      <div>
        <div className="space-y-1">
          {shown.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-xs">
              <span className="text-zinc-500 font-mono shrink-0">{key}:</span>
              <span className="text-zinc-300 font-mono break-all">
                {formatArgValue(value)}
              </span>
            </div>
          ))}
        </div>
        {entries.length > 3 && (
          <button 
            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-400 mt-1.5"
          >
            +{entries.length - 3} more...
          </button>
        )}
      </div>
    );
  } catch {
    // Not valid JSON, show raw
    return <div className="text-xs text-zinc-400 font-mono break-all">{args}</div>;
  }
}

function formatArgValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    if (value.length > 200) return value.slice(0, 197) + '...';
    return value;
  }
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    if (str.length > 200) return str.slice(0, 197) + '...';
    return str;
  }
  return String(value);
}
