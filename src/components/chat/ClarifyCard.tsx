import { useState, useCallback } from 'react';
import type { ClarifyRequest } from '@/api/types';
import { getWSClientForSession } from '@/api/websocket';
import { useChatStore } from '@/stores/chat';
import { useSessionId } from '@/contexts/SessionContext';

interface ClarifyCardProps {
  request: ClarifyRequest;
  onRespond?: () => void;
}

/**
 * ClarifyCard — shown when the agent needs user clarification.
 * Displays a question with optional choice buttons and a free-text input.
 */
export function ClarifyCard({ request, onRespond }: ClarifyCardProps) {
  const [answer, setAnswer] = useState('');
  const [responded, setResponded] = useState(false);
  const sessionId = useSessionId();
  const resolveRequest = useChatStore((s) => s.resolveRequest);

  const handleChoice = useCallback(
    (choice: string) => {
      if (responded || !sessionId) return;
      setResponded(true);
      setAnswer(choice);
      getWSClientForSession(sessionId)?.respondClarify(request.request_id, choice);
      resolveRequest(sessionId, request.request_id);
      onRespond?.();
    },
    [request.request_id, responded, sessionId, resolveRequest, onRespond]
  );

  const handleTextSubmit = useCallback(() => {
    if (!answer.trim() || responded) return;
    handleChoice(answer.trim());
  }, [answer, responded, handleChoice]);

  if (responded) {
    return (
      <div className="rounded-lg border border-zinc-700 border-l-4 border-l-blue-500 bg-zinc-800/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
            <path d="M3 8l3 3 7-7" />
          </svg>
          Responded
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 border-l-4 border-l-blue-500 bg-zinc-800/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-700/50 flex items-center gap-2">
        <span className="text-sm">❓</span>
        <span className="text-sm font-medium text-zinc-200">Clarification Needed</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <div className="mb-3">
          <div className="text-sm text-zinc-200 mb-2">{request.question}</div>

          {/* Choice buttons */}
          {request.choices && request.choices.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {request.choices.slice(0, 4).map((choice) => (
                <button
                  key={choice}
                  onClick={() => handleChoice(choice)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors duration-150"
                >
                  {choice}
                </button>
              ))}
            </div>
          )}

          {/* Free-text "Other" input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
              placeholder="Or type your answer..."
              className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500/50 focus:outline-none transition-colors duration-150"
            />
            <button
              onClick={handleTextSubmit}
              disabled={!answer.trim()}
              className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
