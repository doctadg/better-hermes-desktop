import { useCallback } from 'react';
import {
  useChatStore,
  useSessionMessages,
  useSessionIsStreaming,
  useSessionStreamingContent,
  useSessionStatusKind,
  useSessionStatusText,
} from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import { getWSClientForSession } from '@/api/websocket';

/**
 * Per-session chat orchestration hook. Pass the sessionId of the chat you want
 * to read/write — typically read from <SessionProvider> via useSessionId().
 */
export function useChat(sessionId: string | null | undefined) {
  const messages = useSessionMessages(sessionId);
  const isStreaming = useSessionIsStreaming(sessionId);
  const streamingContent = useSessionStreamingContent(sessionId);
  const statusKind = useSessionStatusKind(sessionId);
  const statusText = useSessionStatusText(sessionId);

  const sendMessageStore = useChatStore((s) => s.sendMessage);
  const interruptStreamStore = useChatStore((s) => s.interruptStream);
  const resolveRequestStore = useChatStore((s) => s.resolveRequest);

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);

  const sendMessage = useCallback(
    (text: string) => {
      if (!activeConnectionId || !sessionId) return;
      sendMessageStore(sessionId, text);
    },
    [activeConnectionId, sessionId, sendMessageStore]
  );

  const interrupt = useCallback(() => {
    if (!sessionId) return;
    interruptStreamStore(sessionId);
  }, [sessionId, interruptStreamStore]);

  const respondApproval = useCallback(
    (requestId: string, choice: 'approve' | 'deny') => {
      if (!sessionId) return;
      getWSClientForSession(sessionId)?.respondApproval(requestId, choice);
      resolveRequestStore(sessionId, requestId);
    },
    [sessionId, resolveRequestStore]
  );

  const respondClarify = useCallback(
    (requestId: string, answer: string) => {
      if (!sessionId) return;
      getWSClientForSession(sessionId)?.respondClarify(requestId, answer);
      resolveRequestStore(sessionId, requestId);
    },
    [sessionId, resolveRequestStore]
  );

  const respondSudo = useCallback(
    (requestId: string, password: string) => {
      if (!sessionId) return;
      getWSClientForSession(sessionId)?.respondSudo(requestId, password);
      resolveRequestStore(sessionId, requestId);
    },
    [sessionId, resolveRequestStore]
  );

  const respondSecret = useCallback(
    (requestId: string, value: string) => {
      if (!sessionId) return;
      getWSClientForSession(sessionId)?.respondSecret(requestId, value);
      resolveRequestStore(sessionId, requestId);
    },
    [sessionId, resolveRequestStore]
  );

  return {
    sessionId: sessionId ?? null,
    messages,
    isStreaming,
    streamingContent,
    statusKind,
    statusText,
    isConnected: !!activeConnectionId,

    sendMessage,
    interrupt,

    respondApproval,
    respondClarify,
    respondSudo,
    respondSecret,
  };
}
