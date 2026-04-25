import { useState, useCallback, useRef, useEffect } from 'react';
import { useChatStore, useSessionIsStreaming, useSessionStatusKind } from '@/stores/chat';
import { useSessionId } from '@/contexts/SessionContext';

interface InputBoxProps {
  disabled?: boolean;
}

const MAX_CHARS = 50000;

export function InputBox({ disabled }: InputBoxProps) {
  const sessionId = useSessionId();
  const sendMessage = useChatStore((s) => s.sendMessage);
  const interruptStream = useChatStore((s) => s.interruptStream);
  const isStreaming = useSessionIsStreaming(sessionId);
  const statusKind = useSessionStatusKind(sessionId);

  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSending, setIsSending] = useState(false);

  const noSession = !sessionId;
  const trulyDisabled = disabled || noSession;
  const isEmpty = text.trim().length === 0;
  const showCharCount = text.length > MAX_CHARS * 0.5;

  const placeholder =
    trulyDisabled
      ? noSession
        ? 'Pick or open a session...'
        : 'Connect to a server to start chatting...'
      : isStreaming
        ? statusKind === 'running'
          ? 'Hermes is working...'
          : 'Hermes is thinking...'
        : 'Ask Hermes anything...';

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(Math.max(el.scrollHeight, 40), 200);
    el.style.height = `${newHeight}px`;
  }, [text]);

  useEffect(() => {
    if (!isStreaming && !trulyDisabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming, trulyDisabled]);

  const handleSend = useCallback(() => {
    if (isEmpty || isStreaming || trulyDisabled || !sessionId) return;
    const msg = text.trim();
    setText('');
    setIsSending(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    sendMessage(sessionId, msg);
    setTimeout(() => setIsSending(false), 200);
  }, [text, isEmpty, isStreaming, trulyDisabled, sessionId, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInterrupt = useCallback(() => {
    if (sessionId) interruptStream(sessionId);
  }, [interruptStream, sessionId]);

  return (
    <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className={`input-container relative flex items-end gap-2 bg-zinc-900 border rounded-xl px-3 py-2 ${
          trulyDisabled
            ? 'border-zinc-800 opacity-60'
            : 'border-zinc-800'
        }`}>
          <button
            className="shrink-0 p-1 rounded-md hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400 transition-colors duration-150 mb-0.5 opacity-50 cursor-not-allowed"
            title="Attach file (coming soon)"
            disabled
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={trulyDisabled || isStreaming}
            rows={1}
            className="input-textarea flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none resize-none min-h-[24px] max-h-[200px] leading-6 disabled:opacity-40 disabled:cursor-not-allowed"
          />

          <div className="flex items-center gap-1 shrink-0 mb-0.5">
            {isStreaming && (
              <button
                onClick={handleInterrupt}
                className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-150"
                title="Stop generating"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1.5" />
                </svg>
              </button>
            )}

            {!isStreaming && (
              <button
                onClick={handleSend}
                disabled={isEmpty || trulyDisabled}
                className={`p-1.5 rounded-lg transition-all duration-150 ${
                  isEmpty || trulyDisabled
                    ? 'text-zinc-700 cursor-not-allowed'
                    : 'bg-amber-500 text-zinc-950 hover:bg-amber-400 active:bg-amber-500 shadow-sm shadow-amber-500/20'
                } ${isSending ? 'animate-send-pulse' : ''}`}
                title="Send message (Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 8l12-6-6 12v-6H2z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-zinc-600 flex items-center gap-2">
            {trulyDisabled ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-700" />
                {noSession ? 'No session' : 'No connection'}
              </span>
            ) : isStreaming ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse-amber" />
                Streaming...
              </span>
            ) : (
              <>
                <span>
                  <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 font-mono text-[9px]">Enter</kbd>
                  {' '}send
                </span>
                <span>
                  <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 font-mono text-[9px]">Shift+Enter</kbd>
                  {' '}new line
                </span>
              </>
            )}
          </span>
          {showCharCount && (
            <span className={`text-[10px] font-mono ${
              text.length > MAX_CHARS ? 'text-red-400' : 'text-zinc-600'
            }`}>
              {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
