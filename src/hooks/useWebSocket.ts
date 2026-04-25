import { useEffect, useState, useCallback } from 'react';
import {
  subscribeWSSession,
  type WSConnectionState,
  getWSClientForSession,
} from '@/api/websocket';
import type { WSMessage } from '@/api/types';
import { useConnectionStore } from '@/stores/connection';
import { useChatStore } from '@/stores/chat';

/**
 * Subscribe a component to the WebSocket for a given session id. The manager
 * refcounts the socket: multiple components subscribing to the same sessionId
 * share one connection.
 *
 * All incoming events are dispatched into the chat store under the session's
 * own slice — concurrent sessions never cross-talk.
 */
export function useSessionWebSocket(sessionId: string | null | undefined): {
  connectionState: WSConnectionState;
  isConnected: boolean;
  respondApproval: (requestId: string, choice: 'approve' | 'deny') => void;
  respondClarify: (requestId: string, answer: string) => void;
  respondSudo: (requestId: string, password: string) => void;
  respondSecret: (requestId: string, value: string) => void;
} {
  const [connectionState, setConnectionState] = useState<WSConnectionState>('disconnected');

  const client = useConnectionStore((s) => s.client);
  const activeProfile = useConnectionStore((s) => s.activeProfile);

  const url = sessionId && client ? client.getWebSocketUrl(sessionId) : null;

  useEffect(() => {
    if (!sessionId || !url) {
      setConnectionState('disconnected');
      return;
    }

    const unsub = subscribeWSSession({
      sessionId,
      url,
      onMessage: (sid, msg) => dispatchToChatStore(sid, msg),
      onStateChange: (state) => setConnectionState(state),
    });

    return unsub;
    // url already includes profile + token; reconnect when it changes.
  }, [sessionId, url, activeProfile]);

  const respondApproval = useCallback(
    (requestId: string, choice: 'approve' | 'deny') => {
      getWSClientForSession(sessionId)?.respondApproval(requestId, choice);
    },
    [sessionId]
  );

  const respondClarify = useCallback(
    (requestId: string, answer: string) => {
      getWSClientForSession(sessionId)?.respondClarify(requestId, answer);
    },
    [sessionId]
  );

  const respondSudo = useCallback(
    (requestId: string, password: string) => {
      getWSClientForSession(sessionId)?.respondSudo(requestId, password);
    },
    [sessionId]
  );

  const respondSecret = useCallback(
    (requestId: string, value: string) => {
      getWSClientForSession(sessionId)?.respondSecret(requestId, value);
    },
    [sessionId]
  );

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    respondApproval,
    respondClarify,
    respondSudo,
    respondSecret,
  };
}

// ─── Event dispatcher (per-session) ───
//
// Routes incoming WS messages to the correct slice in the chat store using
// the sessionId from the dispatch closure.

function dispatchToChatStore(sessionId: string, msg: WSMessage) {
  const store = useChatStore.getState();
  store.ensureSession(sessionId);
  const raw = msg as unknown as Record<string, unknown>;
  const type = raw.type as string;

  switch (type) {
    case 'approval.request': {
      store.addApprovalRequest(sessionId, msg as any);
      store.trackRequest(sessionId, (raw as any).request_id as string, 'approval');
      break;
    }
    case 'clarify.request': {
      store.addClarifyRequest(sessionId, msg as any);
      store.trackRequest(sessionId, (raw as any).request_id as string, 'clarify');
      break;
    }
    case 'sudo.request': {
      store.addSudoRequest(sessionId, msg as any);
      store.trackRequest(sessionId, (raw as any).request_id as string, 'sudo');
      break;
    }
    case 'secret.request': {
      store.addSecretRequest(sessionId, msg as any);
      store.trackRequest(sessionId, (raw as any).request_id as string, 'secret');
      break;
    }

    case 'tool.start': {
      const ev = raw as { tool_id: string; name: string; context?: string };
      store.handleToolStart(sessionId, {
        id: ev.tool_id,
        name: ev.name,
        preview: ev.context,
        status: 'running',
        startedAt: Date.now(),
      });
      break;
    }
    case 'tool.complete': {
      const ev = raw as { tool_id: string; duration_s: number; summary?: string };
      store.handleToolComplete(sessionId, ev.tool_id, {
        status: 'completed',
        duration_s: ev.duration_s,
        summary: ev.summary,
      });
      break;
    }
    case 'tool.progress': {
      const ev = raw as { name: string; preview: string };
      store.handleToolProgress(sessionId, ev.name, ev.preview);
      break;
    }

    case 'status.update': {
      const ev = raw as { kind: string; text: string };
      store.setStatus(
        sessionId,
        ev.kind as 'idle' | 'thinking' | 'running' | 'error',
        ev.text
      );
      break;
    }
    case 'message.delta': {
      store.appendStreamingContent(sessionId, (raw as { text: string }).text);
      break;
    }
    case 'message.complete': {
      const ev = raw as { text: string };
      const slice = store.sessions[sessionId];
      if (ev.text && !slice?.streamingContent) {
        store.appendStreamingContent(sessionId, ev.text);
      }
      store.finalizeStreamingMessage(sessionId);
      store.setStreaming(sessionId, false);
      store.setStatus(sessionId, 'idle', '');
      break;
    }

    case 'session.info':
      break;

    default:
      break;
  }
}
