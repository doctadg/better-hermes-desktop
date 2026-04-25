import { useRef, useEffect, useState, useCallback } from 'react';
import type { Message } from '@/api/types';
import { MessageBubble } from './MessageBubble';
import { StreamingMessage } from './StreamingMessage';

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollToBottom = useCallback((smooth = true) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'instant',
      });
    }
  }, []);

  // Auto-scroll on new messages when user hasn't scrolled up
  useEffect(() => {
    if (autoScroll) {
      // Use requestAnimationFrame for smooth updates
      const raf = requestAnimationFrame(() => {
        scrollToBottom(false);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [messages, autoScroll, scrollToBottom]);

  // Track scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const shouldAutoScroll = distanceFromBottom < 100;
      setAutoScroll(shouldAutoScroll);
      setShowScrollBtn(distanceFromBottom > 100);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto scroll-smooth px-4 py-4 space-y-1"
      >
        {messages.map((message) => {
          if (message.isStreaming) {
            return <StreamingMessage key={message.id} message={message} />;
          }
          return <MessageBubble key={message.id} message={message} />;
        })}

        {/* Bottom anchor for scrolling */}
        <div ref={endRef} className="h-2" />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => {
            scrollToBottom(true);
          }}
          className="scroll-to-bottom-btn flex items-center gap-1.5 px-3 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium shadow-lg hover:bg-zinc-700 hover:border-zinc-600 transition-colors duration-150 animate-slide-up-fast"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6l4 4 4-4" />
          </svg>
          New messages
        </button>
      )}
    </div>
  );
}
