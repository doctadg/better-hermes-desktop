import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '@/api/types';
import { normalizeMarkdownContent } from '@/api/markdown';
import {
  useSessionStreamingContent,
  useSessionToolCalls,
  useSessionStatusKind,
  useSessionStatusText,
} from '@/stores/chat';
import { useSessionId } from '@/contexts/SessionContext';
import { ToolCard } from './ToolCard';

interface StreamingMessageProps {
  message: Message;
}

// Shared markdown components for streaming
const streamingMarkdownComponents = {
  code(props: React.HTMLAttributes<HTMLElement> & { inline?: boolean; className?: string; children?: React.ReactNode }) {
    const { children, className, ...rest } = props;
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const isInline = !className;

    if (isInline) {
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    }

    return (
      <div className="code-block-wrapper">
        <div className="code-block-header">
          <span className="code-language">{language || 'code'}</span>
        </div>
        <pre>
          <code>{String(children).replace(/\n$/, '')}</code>
        </pre>
      </div>
    );
  },
  pre(props: React.HTMLAttributes<HTMLElement>) {
    const { children, ...rest } = props;
    return <div {...rest}>{children}</div>;
  },
  a(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    const { children, href, ...rest } = props;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          const win = window as unknown as { hermesAPI?: { invoke: (cmd: string, payload?: unknown) => Promise<unknown> } };
          if (win.hermesAPI) {
            win.hermesAPI.invoke('open-external', { url: href });
          } else {
            window.open(href, '_blank');
          }
        }}
        {...rest}
      >
        {children}
      </a>
    );
  },
};

export function StreamingMessage({ message }: StreamingMessageProps) {
  const sessionId = useSessionId();
  const streamingContent = useSessionStreamingContent(sessionId);
  const currentToolCalls = useSessionToolCalls(sessionId);
  const statusKind = useSessionStatusKind(sessionId);
  const statusText = useSessionStatusText(sessionId);

  const rawDisplayContent = streamingContent || message.content;
  const displayContent = useMemo(
    () => normalizeMarkdownContent(rawDisplayContent),
    [rawDisplayContent]
  );
  const toolCallsArray = useMemo(() => Array.from(currentToolCalls.values()), [currentToolCalls]);

  // Separate running vs completed tool calls
  const runningTools = toolCallsArray.filter((tc) => tc.status === 'running');
  const completedTools = toolCallsArray.filter((tc) => tc.status !== 'running');

  return (
    <div className="animate-slide-up message-bubble flex gap-3 my-3 max-w-3xl mr-auto">
      {/* Avatar */}
      <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold mt-1 bg-zinc-800 text-zinc-400 border border-zinc-700">
        H
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="message-bubble-assistant">
          {/* Status indicator when no content yet */}
          {!displayContent && statusKind !== 'idle' && (
            <div className="flex items-center gap-2.5 text-sm text-zinc-400 px-4 py-3">
              <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span>{statusText || 'Thinking...'}</span>
            </div>
          )}

          {/* Streaming markdown content */}
          {displayContent && (
            <div className="selectable markdown-content px-4 py-3 text-zinc-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={streamingMarkdownComponents}>
                {displayContent}
              </ReactMarkdown>
              {/* Blinking cursor */}
              <span className="inline-block w-[3px] h-[18px] bg-amber-500 animate-blink-cursor align-text-bottom ml-0.5 rounded-full" />
            </div>
          )}
        </div>

        {/* Running tool cards (shown below streaming text) */}
        {runningTools.length > 0 && (
          <div className="mt-2 space-y-2">
            {runningTools.map((tc) => (
              <ToolCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Completed tool cards */}
        {completedTools.length > 0 && (
          <div className="mt-2 space-y-2">
            {completedTools.map((tc) => (
              <ToolCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Tool progress indicator when tools are running and no content */}
        {runningTools.length > 0 && !displayContent && (
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500 px-1">
            <span className="inline-block w-2 h-2 border border-amber-500/60 border-t-transparent rounded-full animate-spin" />
            <span>{runningTools[runningTools.length - 1]?.name || 'Running tool...'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
