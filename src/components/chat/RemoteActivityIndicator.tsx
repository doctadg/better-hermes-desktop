import type { SessionActivity } from '@/api/types';

interface RemoteActivityIndicatorProps {
  activity: SessionActivity;
}

export function RemoteActivityIndicator({ activity }: RemoteActivityIndicatorProps) {
  const { active_tools, active_subagents, last_assistant_text, last_event_type } = activity;

  // Determine status text
  const statusLabel = active_tools.length > 0
    ? `Running ${active_tools[0]}${active_tools.length > 1 ? ` +${active_tools.length - 1}` : ''}...`
    : last_event_type === 'message.delta'
      ? 'Generating response...'
      : 'Agent is working...';

  return (
    <div className="animate-slide-up message-bubble flex gap-3 my-3 max-w-3xl mr-auto">
      {/* Avatar */}
      <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold mt-1 bg-zinc-800 text-zinc-400 border border-zinc-700 relative">
        H
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-zinc-950 animate-pulse" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="message-bubble-assistant">
          {/* Status line */}
          <div className="flex items-center gap-2.5 text-sm text-zinc-400 px-4 py-3">
            <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span>{statusLabel}</span>
          </div>

          {/* Active tools list */}
          {active_tools.length > 0 && (
            <div className="px-4 pb-2 space-y-1">
              {active_tools.map((tool) => (
                <div key={tool} className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="inline-block w-2 h-2 border border-amber-500/60 border-t-transparent rounded-full animate-spin" />
                  <span className="font-mono">{tool}</span>
                </div>
              ))}
            </div>
          )}

          {/* Subagent badge */}
          {active_subagents > 0 && (
            <div className="px-4 pb-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-medium">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                {active_subagents} subagent{active_subagents > 1 ? 's' : ''} active
              </span>
            </div>
          )}

          {/* Last output preview */}
          {last_assistant_text && (
            <div className="px-4 pb-3 pt-1">
              <p className="text-xs text-zinc-600 line-clamp-2 font-mono break-all">
                {last_assistant_text}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
