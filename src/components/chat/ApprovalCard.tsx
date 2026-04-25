import { useState, useCallback } from 'react';
import type { Message } from '@/api/types';
import { getWSClientForSession } from '@/api/websocket';
import { useChatStore } from '@/stores/chat';
import { useSessionId } from '@/contexts/SessionContext';
import { ClarifyCard } from './ClarifyCard';
import { SudoCard } from './SudoCard';
import { SecretCard } from './SecretCard';

interface ApprovalCardProps {
  message: Message;
  onRespond?: () => void;
}

/**
 * ApprovalCard — router component that renders the correct interactive
 * callback card based on the message's request type.
 *
 * Delegates to ClarifyCard, SudoCard, and SecretCard for non-approval requests.
 * Handles approval requests directly (command display + approve/deny buttons).
 *
 * Kept as a monolithic entry point so MessageBubble.tsx doesn't need changes.
 */
export function ApprovalCard({ message, onRespond }: ApprovalCardProps) {
  // Delegate to standalone sub-components
  if (message.clarifyRequest) {
    return <ClarifyCard request={message.clarifyRequest} onRespond={onRespond} />;
  }

  if (message.sudoRequest) {
    return <SudoCard request={message.sudoRequest} onRespond={onRespond} />;
  }

  if (message.secretRequest) {
    return <SecretCard request={message.secretRequest} onRespond={onRespond} />;
  }

  // Handle approval request directly
  if (message.approvalRequest) {
    return <ApprovalContent message={message} onRespond={onRespond} />;
  }

  return null;
}

// ─── Approval Content (inline, not a separate file) ───
function ApprovalContent({ message, onRespond }: { message: Message; onRespond?: () => void }) {
  const request = message.approvalRequest!;
  const [responded, setResponded] = useState(false);
  const [choice, setChoice] = useState<'approve' | 'deny' | null>(null);
  const sessionId = useSessionId();
  const resolveRequest = useChatStore((s) => s.resolveRequest);

  const handleRespond = useCallback(
    (c: 'approve' | 'deny') => {
      if (responded || !sessionId) return;
      setResponded(true);
      setChoice(c);
      getWSClientForSession(sessionId)?.respondApproval(request.request_id, c);
      resolveRequest(sessionId, request.request_id);
      onRespond?.();
    },
    [request.request_id, responded, sessionId, resolveRequest, onRespond]
  );

  // Resolved state
  if (responded) {
    return (
      <div className={`rounded-lg border border-zinc-700 border-l-4 ${
        choice === 'approve' ? 'border-l-emerald-500' : 'border-l-red-500'
      } bg-zinc-800/50 px-4 py-3`}>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
            <path d="M3 8l3 3 7-7" />
          </svg>
          {choice === 'approve' ? 'Approved' : 'Denied'}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 border-l-4 border-l-red-500 bg-zinc-800/50 overflow-hidden">
      {/* Header — warning style */}
      <div className="px-4 py-2.5 border-b border-zinc-700/50 flex items-center gap-2">
        <span className="text-sm">⚡</span>
        <span className="text-sm font-medium text-amber-300">Approval Required</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <div className="mb-3">
          <div className="text-xs text-zinc-500 mb-1">Command</div>
          <div className="text-sm font-mono bg-zinc-900 rounded-md p-2 text-zinc-300 whitespace-pre-wrap">
            {request.command}
          </div>
        </div>

        {request.pattern_key && (
          <div className="mb-3">
            <div className="text-xs text-zinc-500 mb-1">Danger Pattern</div>
            <div className="text-sm text-red-400 font-mono bg-red-950/30 rounded-md px-2 py-1">
              {request.pattern_key}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRespond('approve')}
            className="px-4 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 font-medium transition-colors duration-150"
          >
            Approve
          </button>
          <button
            onClick={() => handleRespond('deny')}
            className="px-4 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-500 font-medium transition-colors duration-150"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
