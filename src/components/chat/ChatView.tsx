import { useChatStore, useSessionMessages, useSessionIsStreaming, useSessionRemoteActivity } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import { SessionProvider, useSessionId } from '@/contexts/SessionContext';
import { useSessionWebSocket } from '@/hooks/useWebSocket';
import { useSessionActivityPoll } from '@/hooks/useSessionActivity';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';

const QUICK_ACTIONS = [
  { label: 'Explain this codebase', icon: '🔍', prompt: 'Explain this codebase. What does it do, how is it structured, and what are the key components?' },
  { label: 'Write a Python script', icon: '🐍', prompt: 'Write a Python script' },
  { label: 'Debug this error', icon: '🐛', prompt: 'Help me debug an error. I\'ll paste the error message.' },
  { label: 'Plan a feature', icon: '📋', prompt: 'Help me plan a new feature. I\'ll describe what I want to build.' },
];

interface ChatViewProps {
  sessionId: string | null;
}

export function ChatView({ sessionId }: ChatViewProps) {
  return (
    <SessionProvider sessionId={sessionId}>
      <ChatViewInner />
    </SessionProvider>
  );
}

function ChatViewInner() {
  const sessionId = useSessionId();
  const messages = useSessionMessages(sessionId);
  const isStreaming = useSessionIsStreaming(sessionId);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const serverConfig = useConnectionStore((s) => s.serverConfig);
  const isConnecting = useConnectionStore((s) => s.isConnecting);

  // Poll for remote activity from other clients (e.g. Telegram)
  // Only polls when NOT locally streaming
  const remoteActivity = useSessionActivityPoll(sessionId);

  // Determine if the agent is active remotely (not from our SSE stream)
  const isRemoteActive = remoteActivity?.is_active === true && !isStreaming;

  // Keep the WebSocket alive as long as this view is mounted with a session.
  useSessionWebSocket(sessionId);

  const hasMessages = messages.length > 0;

  if (!sessionId) {
    return (
      <div className="flex flex-col h-full bg-zinc-950 items-center justify-center text-zinc-600 text-sm px-6">
        <div className="text-center space-y-2 max-w-xs">
          <p>This pane is empty.</p>
          <p className="text-xs text-zinc-700">
            Pick a session from the sidebar, or click <span className="text-zinc-500">New Chat</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {hasMessages ? (
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          isRemoteActive={isRemoteActive}
          remoteActivity={remoteActivity}
        />
      ) : (
        <WelcomeScreen
          isConnected={!!activeConnectionId}
          isConnecting={isConnecting}
          modelName={serverConfig?.model_name || serverConfig?.model}
          isRemoteActive={isRemoteActive}
          remoteActivity={remoteActivity}
        />
      )}
      <InputBox disabled={!activeConnectionId} isRemoteActive={isRemoteActive} />
    </div>
  );
}

interface WelcomeScreenProps {
  isConnected: boolean;
  isConnecting: boolean;
  modelName?: string;
  isRemoteActive: boolean;
  remoteActivity: import('@/api/types').SessionActivity | null;
}

function WelcomeScreen({ isConnected, isConnecting, modelName, isRemoteActive, remoteActivity }: WelcomeScreenProps) {
  const sessionId = useSessionId();
  const sendMessage = useChatStore((s) => s.sendMessage);

  const handleQuickAction = (prompt: string) => {
    if (!isConnected || !sessionId) return;
    sendMessage(sessionId, prompt);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in-up">
      <div className="flex flex-col items-center gap-6 max-w-lg w-full">
        {/* Logo */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center shadow-xl shadow-amber-500/20">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L4 10v12l12 6 12-6V10L16 4z" fill="rgb(9 9 11)" opacity="0.3" />
              <path d="M16 4L4 10l12 6 12-6L16 4z" fill="rgb(254 243 199)" opacity="0.9" />
              <path d="M4 10v12l12 6V16L4 10z" fill="rgb(253 230 138)" opacity="0.7" />
              <path d="M16 16v12l12-6V10L16 16z" fill="rgb(252 211 77)" opacity="0.8" />
            </svg>
          </div>
          <div className="absolute inset-0 rounded-2xl border border-amber-500/20 scale-125 -z-10" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-50 mb-2 tracking-tight">
            Hermes Desktop
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">
            Your AI-powered coding companion. Ask questions, run commands, build projects, and more.
          </p>
        </div>

        {isConnecting && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse-amber" />
            Connecting...
          </div>
        )}

        {isConnected && modelName && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Connected — {modelName}
          </div>
        )}

        {!isConnected && !isConnecting && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
            <span className="inline-block w-2 h-2 rounded-full bg-zinc-700" />
            Not connected
          </div>
        )}

        {/* Remote activity indicator on welcome screen */}
        {isRemoteActive && remoteActivity && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Agent is working via another client
            {remoteActivity.active_tools.length > 0 && (
              <span className="text-amber-500/70"> — {remoteActivity.active_tools.join(', ')}</span>
            )}
          </div>
        )}

        <div className="w-full">
          <p className="text-xs text-zinc-600 text-center mb-3">Quick actions</p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action.prompt)}
                disabled={!isConnected || !sessionId}
                className="quick-action-chip group flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-zinc-800 text-left transition-all duration-150 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-zinc-800"
              >
                <span className="text-lg flex-shrink-0">{action.icon}</span>
                <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors duration-150">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {isConnected && (
          <p className="text-[10px] text-zinc-600 text-center">
            Press <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 font-mono text-[9px] mx-0.5">Enter</kbd> to send,
            <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 font-mono text-[9px] mx-0.5">Shift+Enter</kbd> for new line
          </p>
        )}
      </div>
    </div>
  );
}
