import { useState, useCallback } from 'react';
import type { SudoRequest } from '@/api/types';
import { getWSClientForSession } from '@/api/websocket';
import { useChatStore } from '@/stores/chat';
import { useSessionId } from '@/contexts/SessionContext';

interface SudoCardProps {
  request: SudoRequest;
  onRespond?: () => void;
}

/**
 * SudoCard — shown when the agent needs a sudo password to continue.
 * Provides a masked password input with a visibility toggle.
 */
export function SudoCard({ request, onRespond }: SudoCardProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [responded, setResponded] = useState(false);
  const sessionId = useSessionId();
  const resolveRequest = useChatStore((s) => s.resolveRequest);

  const handleSubmit = useCallback(() => {
    if (!password || responded || !sessionId) return;
    setResponded(true);
    getWSClientForSession(sessionId)?.respondSudo(request.request_id, password);
    resolveRequest(sessionId, request.request_id);
    onRespond?.();
  }, [password, request.request_id, responded, sessionId, resolveRequest, onRespond]);

  if (responded) {
    return (
      <div className="rounded-lg border border-zinc-700 border-l-4 border-l-orange-500 bg-zinc-800/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
            <path d="M3 8l3 3 7-7" />
          </svg>
          Password submitted
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 border-l-4 border-l-orange-500 bg-zinc-800/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-700/50 flex items-center gap-2">
        <span className="text-sm">🔒</span>
        <span className="text-sm font-medium text-zinc-200">Sudo Password Required</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <div className="mb-3">
          <div className="text-sm text-zinc-300 mb-2">
            Sudo password is required to continue.
          </div>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Enter password"
              className="w-full px-3 py-2 pr-10 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none transition-colors duration-150 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors duration-150"
              tabIndex={-1}
            >
              {showPassword ? (
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
          disabled={!password}
          className="px-4 py-1.5 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors duration-150"
        >
          Submit Password
        </button>
      </div>
    </div>
  );
}
