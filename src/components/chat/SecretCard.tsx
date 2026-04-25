import { useState, useCallback } from 'react';
import type { SecretRequest } from '@/api/types';
import { getWSClientForSession } from '@/api/websocket';
import { useChatStore } from '@/stores/chat';
import { useSessionId } from '@/contexts/SessionContext';

interface SecretCardProps {
  request: SecretRequest;
  onRespond?: () => void;
}

/**
 * SecretCard — shown when the agent needs an environment variable or secret.
 * Displays the env var name, prompt, and a toggleable input field.
 */
export function SecretCard({ request, onRespond }: SecretCardProps) {
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [responded, setResponded] = useState(false);
  const sessionId = useSessionId();
  const resolveRequest = useChatStore((s) => s.resolveRequest);

  const handleSubmit = useCallback(() => {
    if (!value || responded || !sessionId) return;
    setResponded(true);
    getWSClientForSession(sessionId)?.respondSecret(request.request_id, value);
    resolveRequest(sessionId, request.request_id);
    onRespond?.();
  }, [value, request.request_id, responded, sessionId, resolveRequest, onRespond]);

  if (responded) {
    return (
      <div className="rounded-lg border border-zinc-700 border-l-4 border-l-purple-500 bg-zinc-800/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
            <path d="M3 8l3 3 7-7" />
          </svg>
          Secret submitted
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 border-l-4 border-l-purple-500 bg-zinc-800/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-700/50 flex items-center gap-2">
        <span className="text-sm">🔑</span>
        <span className="text-sm font-medium text-zinc-200">Secret Required</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <div className="mb-3">
          {/* Prompt */}
          <div className="text-sm text-zinc-300 mb-2">{request.prompt}</div>

          {/* Env var badge */}
          <div className="mb-2">
            <div className="text-xs text-zinc-500 mb-1">Environment Variable</div>
            <div className="text-sm font-mono text-purple-400 bg-zinc-900 rounded-md px-2 py-1">
              {request.env_var}
            </div>
          </div>

          {/* Input with visibility toggle */}
          <div className="relative">
            <input
              type={showValue ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Enter value"
              className="w-full px-3 py-2 pr-10 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:border-purple-500/50 focus:outline-none transition-colors duration-150 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowValue((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors duration-150"
              tabIndex={-1}
            >
              {showValue ? (
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
        <button
          onClick={handleSubmit}
          disabled={!value}
          className="px-4 py-1.5 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors duration-150"
        >
          Submit Secret
        </button>
      </div>
    </div>
  );
}
