import { useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '@/api/types';
import { normalizeMarkdownContent } from '@/api/markdown';
import { ToolCard } from './ToolCard';
import { ApprovalCard } from './ApprovalCard';
import { ClarifyCard } from './ClarifyCard';
import { SudoCard } from './SudoCard';
import { SecretCard } from './SecretCard';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isError = message.role === 'assistant' && message.content?.startsWith('Error:');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = message.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [message.content]);

  const formattedTime = useMemo(() => {
    return new Date(message.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [message.timestamp]);

  const renderableContent = useMemo(
    () => normalizeMarkdownContent(message.content),
    [message.content]
  );

  // ─── Callback cards (approval, clarify, sudo, secret) ───
  if (message.approvalRequest || message.clarifyRequest || message.sudoRequest || message.secretRequest) {
    if (message.approvalRequest) {
      return (
        <div className="animate-slide-up max-w-3xl mx-auto my-2">
          <ApprovalCard message={message} onRespond={() => {}} />
        </div>
      );
    }
    if (message.clarifyRequest) {
      return (
        <div className="animate-slide-up max-w-3xl mx-auto my-2">
          <ClarifyCard request={message.clarifyRequest} onRespond={() => {}} />
        </div>
      );
    }
    if (message.sudoRequest) {
      return (
        <div className="animate-slide-up max-w-3xl mx-auto my-2">
          <SudoCard request={message.sudoRequest} onRespond={() => {}} />
        </div>
      );
    }
    if (message.secretRequest) {
      return (
        <div className="animate-slide-up max-w-3xl mx-auto my-2">
          <SecretCard request={message.secretRequest} onRespond={() => {}} />
        </div>
      );
    }
    return null;
  }

  // ─── System messages ───
  if (isSystem) {
    return (
      <div className="animate-slide-up flex justify-center my-3 px-4">
        <div className="text-xs text-zinc-500 bg-zinc-800/50 border border-zinc-800 rounded-lg px-3 py-1.5 max-w-md text-center">
          {message.content}
        </div>
      </div>
    );
  }

  // ─── Tool-only messages (no content) ───
  // Mirror the assistant message layout (avatar + left-aligned column) so a
  // tool card stays in the same column whether or not the assistant ends up
  // emitting prose alongside it.
  if (!message.content && message.toolCalls && message.toolCalls.length > 0) {
    return (
      <div className="animate-slide-up message-bubble flex gap-3 my-3 max-w-3xl mr-auto">
        <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold mt-1 bg-zinc-800 text-zinc-400 border border-zinc-700">
          H
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {message.toolCalls.map((tc) => (
            <ToolCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      </div>
    );
  }

  // ─── Error messages ───
  if (isError) {
    return (
      <div
        className="animate-slide-up message-bubble flex gap-3 my-3 max-w-3xl mx-auto"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold mt-1 bg-red-500/15 text-red-400">
          !
        </div>
        <div className="flex-1 min-w-0">
          <div className="message-bubble-error px-4 py-3">
            <div className="selectable text-sm text-red-300">
              {message.content.replace(/^Error:\s*/, '')}
            </div>
            <button
              onClick={handleCopy}
              className="copy-btn absolute top-2 right-2 p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
              title="Copy error"
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                  <path d="M3 8l3 3 7-7" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="5" y="5" width="9" height="9" rx="1.5" />
                  <path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" />
                </svg>
              )}
            </button>
          </div>
          {hovered && (
            <div className="text-[10px] text-zinc-600 mt-1 text-center">
              {formattedTime}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── User and Assistant messages ───
  return (
    <div
      className={`animate-slide-up message-bubble flex gap-3 my-3 max-w-3xl ${
        isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold mt-1 transition-colors duration-150 ${
          isUser
            ? 'bg-amber-500/20 text-amber-400'
            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
        }`}
      >
        {isUser ? 'U' : 'H'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className={`relative ${
            isUser ? 'message-bubble-user' : 'message-bubble-assistant'
          }`}
        >
          {/* Message content with markdown */}
          <div className="selectable markdown-content px-4 py-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {renderableContent}
            </ReactMarkdown>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className={`copy-btn absolute top-2 right-2 p-1.5 rounded-md hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-all duration-150 ${
              copied ? 'opacity-100' : ''
            }`}
            title={copied ? 'Copied!' : 'Copy message'}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <path d="M3 8l3 3 7-7" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="5" width="9" height="9" rx="1.5" />
                <path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" />
              </svg>
            )}
          </button>
        </div>

        {/* Tool cards */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.toolCalls.map((tc) => (
              <ToolCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Timestamp on hover */}
        <div
          className={`text-[10px] text-zinc-600 mt-1.5 transition-opacity duration-150 ${
            hovered ? 'opacity-100' : 'opacity-0'
          } ${isUser ? 'text-right' : ''}`}
        >
          {formattedTime}
        </div>
      </div>
    </div>
  );
}

// ─── Markdown Components ───
const markdownComponents = {
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
      <CodeBlock language={language}>
        {String(children).replace(/\n$/, '')}
      </CodeBlock>
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
          // Open in system browser (works in Electron)
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
  table(props: React.TableHTMLAttributes<HTMLTableElement>) {
    return (
      <div className="overflow-x-auto rounded-lg border border-zinc-800 my-2">
        <table {...props} />
      </div>
    );
  },
  img(props: React.ImgHTMLAttributes<HTMLImageElement>) {
    return <img {...props} loading="lazy" />;
  },
};

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback
    }
  }, [children]);

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-language">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200 transition-colors duration-150"
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <path d="M3 8l3 3 7-7" />
              </svg>
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="5" width="9" height="9" rx="1.5" />
                <path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}
