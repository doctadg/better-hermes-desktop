/**
 * Hermes Desktop - WebSocket Client + Manager
 *
 * One WSClient per session id. The manager refcounts subscribers so multiple
 * panes/components can share the same socket without re-opening it, and the
 * socket closes when the last subscriber releases.
 *
 * Each socket binds to one session via the `?session_id=` query param. Events
 * arriving on a socket are scoped to that session — the dispatcher passes
 * sessionId in to the chat store so events route to the right slice.
 */

import type { WSMessage, WSServerResponse } from './types';

export type WSConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface WSClientOptions {
  url: string;
  onMessage?: (message: WSMessage) => void;
  onStateChange?: (state: WSConnectionState) => void;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  pingInterval?: number;
  pongTimeout?: number;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private options: WSClientOptions;
  private state: WSConnectionState = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentReconnectInterval: number;
  private messageQueue: string[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(options: WSClientOptions) {
    this.options = {
      reconnectInterval: 1000,
      maxReconnectInterval: 30000,
      pingInterval: 30000,
      pongTimeout: 15000,
      ...options,
    };
    this.currentReconnectInterval = this.options.reconnectInterval!;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.destroyed) return;

    this.setState('connecting');
    this.stopKeepalive();

    try {
      this.ws = new WebSocket(this.options.url);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setState('connected');
      this.currentReconnectInterval = this.options.reconnectInterval!;
      this.startKeepalive();

      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift()!;
        this.ws?.send(msg);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'pong') {
          this.resetPongDeadline();
          return;
        }
        this.options.onMessage?.(parsed as WSMessage);
      } catch (err) {
        console.warn('[WS] Failed to parse message:', event.data, err);
      }
    };

    this.ws.onclose = () => {
      this.stopKeepalive();
      if (!this.destroyed && this.state !== 'disconnected') {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event) => {
      console.error('[WS] Error:', event);
    };
  }

  disconnect() {
    this.setState('disconnected');
    this.stopKeepalive();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  send(message: WSServerResponse) {
    const data = JSON.stringify(message);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.messageQueue.push(data);
    }
  }

  respondApproval(requestId: string, choice: 'approve' | 'deny') {
    this.send({ type: 'approval.respond', request_id: requestId, choice });
  }

  respondClarify(requestId: string, answer: string) {
    this.send({ type: 'clarify.respond', request_id: requestId, answer });
  }

  respondSudo(requestId: string, password: string) {
    this.send({ type: 'sudo.respond', request_id: requestId, password });
  }

  respondSecret(requestId: string, value: string) {
    this.send({ type: 'secret.respond', request_id: requestId, value });
  }

  getState(): WSConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private setState(state: WSConnectionState) {
    this.state = state;
    this.options.onStateChange?.(state);
  }

  private scheduleReconnect() {
    if (this.state === 'disconnected' || this.destroyed) return;

    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.currentReconnectInterval);

    this.currentReconnectInterval = Math.min(
      this.currentReconnectInterval * 2,
      this.options.maxReconnectInterval!
    );
  }

  private startKeepalive() {
    this.stopKeepalive();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
        this.resetPongDeadline();
      }
    }, this.options.pingInterval!);
    this.resetPongDeadline();
  }

  private resetPongDeadline() {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => {
      console.warn('[WS] Pong timeout — closing for reconnect');
      this.ws?.close(4000, 'Pong timeout');
    }, this.options.pongTimeout!);
  }

  private stopKeepalive() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.disconnect();
    this.messageQueue = [];
  }
}

// ─── Per-session WS manager (refcounted) ───
//
// Each session id has at most one WSClient. Components subscribe to a session
// and the manager opens (or returns) the socket; when the last subscriber
// releases, the socket is destroyed.

interface ManagedSocket {
  client: WSClient;
  refCount: number;
  state: WSConnectionState;
  url: string;
  stateListeners: Set<(state: WSConnectionState) => void>;
  onMessageHandlers: Set<(sid: string, msg: WSMessage) => void>;
}

const sockets = new Map<string, ManagedSocket>();

export interface SubscribeOptions {
  sessionId: string;
  url: string;
  onMessage: (sessionId: string, message: WSMessage) => void;
  onStateChange?: (state: WSConnectionState) => void;
}

/**
 * Subscribe to the socket for the given session. Opens the socket if needed,
 * or returns the existing one. Returns an unsubscribe function that decrements
 * the refcount and closes the socket when it hits zero.
 */
export function subscribeWSSession(opts: SubscribeOptions): () => void {
  const { sessionId, url, onMessage, onStateChange } = opts;
  let entry = sockets.get(sessionId);

  // If a socket exists but the URL changed (e.g. profile/token changed), recreate it.
  if (entry && entry.url !== url) {
    entry.client.destroy();
    sockets.delete(sessionId);
    entry = undefined;
  }

  if (!entry) {
    const client = new WSClient({
      url,
      onMessage: (msg) => {
        const live = sockets.get(sessionId);
        if (live) live.onMessageHandlers.forEach((h) => h(sessionId, msg));
      },
      onStateChange: (state) => {
        const live = sockets.get(sessionId);
        if (live) {
          live.state = state;
          live.stateListeners.forEach((l) => l(state));
        }
      },
    });
    const managed: ManagedSocket = {
      client,
      refCount: 0,
      state: 'disconnected',
      url,
      stateListeners: new Set(),
      onMessageHandlers: new Set(),
    };
    sockets.set(sessionId, managed);
    entry = managed;
    client.connect();
  }

  entry.refCount += 1;
  entry.onMessageHandlers.add(onMessage);
  if (onStateChange) {
    entry.stateListeners.add(onStateChange);
    onStateChange(entry.state);
  }

  return () => {
    const e = sockets.get(sessionId);
    if (!e) return;
    e.onMessageHandlers.delete(onMessage);
    if (onStateChange) e.stateListeners.delete(onStateChange);
    e.refCount = Math.max(0, e.refCount - 1);
    if (e.refCount === 0) {
      e.client.destroy();
      sockets.delete(sessionId);
    }
  };
}

/**
 * Look up the WSClient for a given session, if any. Used by interactive
 * callback components (approval/sudo/secret/clarify cards) to send responses
 * without a hook.
 */
export function getWSClientForSession(sessionId: string | null | undefined): WSClient | null {
  if (!sessionId) return null;
  return sockets.get(sessionId)?.client ?? null;
}

/**
 * Tear down all sockets — used when the active connection is replaced.
 */
export function destroyAllSockets(): void {
  for (const entry of sockets.values()) {
    entry.client.destroy();
  }
  sockets.clear();
}
