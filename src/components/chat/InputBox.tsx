import { useState, useCallback, useRef, useEffect } from 'react';
import { useChatStore, useSessionIsStreaming, useSessionStatusKind } from '@/stores/chat';
import { useSessionId } from '@/contexts/SessionContext';

interface InputBoxProps {
  disabled?: boolean;
  isRemoteActive?: boolean;
}

interface Attachment {
  file: File;
  previewUrl: string;
  name: string;
  size: number;
}

const MAX_CHARS = 50000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export function InputBox({ disabled, isRemoteActive }: InputBoxProps) {
  const sessionId = useSessionId();
  const sendMessage = useChatStore((s) => s.sendMessage);
  const interruptStream = useChatStore((s) => s.interruptStream);
  const isStreaming = useSessionIsStreaming(sessionId);
  const statusKind = useSessionStatusKind(sessionId);

  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const dragCounterRef = useRef(0);

  const noSession = !sessionId;
  const trulyDisabled = disabled || noSession;
  const isEmpty = text.trim().length === 0 && attachments.length === 0;
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

  // Cleanup preview URLs on unmount or when attachments change
  useEffect(() => {
    return () => {
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
  }, [attachments]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newAttachments: Attachment[] = [];
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) continue;
      // Accept images and other files (up to size limit)
      const previewUrl = ACCEPTED_IMAGE_TYPES.includes(file.type)
        ? URL.createObjectURL(file)
        : '';
      newAttachments.push({
        file,
        previewUrl,
        name: file.name,
        size: file.size,
      });
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Drag handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  // Paste handler
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) addFiles([file]);
        return;
      }
    }
  }, [addFiles]);

  const handleSend = useCallback(() => {
    if ((isEmpty && attachments.length === 0) || isStreaming || trulyDisabled || !sessionId) return;
    let msg = text.trim();
    // Append attachment info
    if (attachments.length > 0) {
      const attachmentText = attachments
        .map((a) => `[Attached: ${a.name}]`)
        .join(' ');
      msg = msg ? `${msg}\n${attachmentText}` : attachmentText;
    }
    setText('');
    // Cleanup attachment URLs
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
    setIsSending(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    sendMessage(sessionId, msg);
    setTimeout(() => setIsSending(false), 200);
  }, [text, isEmpty, isStreaming, trulyDisabled, sessionId, sendMessage, attachments]);

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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm px-4 py-3"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto relative">
        {/* Drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-amber-500/5 border-2 border-dashed border-amber-500/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-1 text-amber-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
              <span className="text-sm font-medium">Drop files here</span>
              <span className="text-xs text-amber-500/70">Images &amp; files up to 10MB</span>
            </div>
          </div>
        )}

        <div className={`input-container relative flex items-end gap-2 bg-zinc-900 border rounded-xl px-3 py-2 transition-colors duration-200 ${
          isDragging
            ? 'border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
            : trulyDisabled
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
            onPaste={handlePaste}
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
                disabled={(isEmpty && attachments.length === 0) || trulyDisabled}
                className={`p-1.5 rounded-lg transition-all duration-150 ${
                  (isEmpty && attachments.length === 0) || trulyDisabled
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

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {attachments.map((att, index) => (
              <div
                key={`${att.name}-${index}`}
                className="relative group flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 pr-8 max-w-[200px]"
              >
                {/* Thumbnail or file icon */}
                {att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="w-8 h-8 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500">
                      <path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" />
                      <path d="M9 1v4h4" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-300 truncate">{att.name}</p>
                  <p className="text-[10px] text-zinc-600">{formatFileSize(att.size)}</p>
                </div>
                {/* Remove button */}
                <button
                  onClick={() => removeAttachment(index)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400 hover:border-red-500/40 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove attachment"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-zinc-600 flex items-center gap-2">
            {isRemoteActive ? (
              <span className="flex items-center gap-1 text-amber-500">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Agent active via another client — messages will queue
              </span>
            ) : trulyDisabled ? (
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
                <span>
                  <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 font-mono text-[9px]">Ctrl+V</kbd>
                  {' '}paste image
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
