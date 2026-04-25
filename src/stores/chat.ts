/**
 * Hermes Desktop - Chat Store
 *
 * Multi-session aware. State is keyed by sessionId so multiple sessions can
 * stream concurrently without cross-talk. All actions take a sessionId as
 * their first argument.
 *
 * AbortControllers live in a module-level map (transient, not persisted).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type Message,
  type ChatCompletionChunk,
  type ToolProgressEvent,
  type ToolCallInfo,
  type ApprovalRequest,
  type ClarifyRequest,
  type SudoRequest,
  type SecretRequest,
  type SessionHistoryMessage,
  getToolArgsPreview,
} from '@/api/types';
import { useConnectionStore } from './connection';

export interface ActiveRequest {
  type: 'approval' | 'clarify' | 'sudo' | 'secret';
  resolved: boolean;
}

export type StatusKind = 'idle' | 'thinking' | 'running' | 'error';

export interface SessionSlice {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  currentToolCalls: Map<string, ToolCallInfo>;
  statusKind: StatusKind;
  statusText: string;
  activeRequests: Map<string, ActiveRequest>;
  // Cross-client activity (from polling /api/sessions/{id}/activity)
  remoteActivity: import('@/api/types').SessionActivity | null;
}

const EMPTY_SLICE: SessionSlice = {
  messages: [],
  isStreaming: false,
  streamingContent: '',
  currentToolCalls: new Map(),
  statusKind: 'idle',
  statusText: '',
  activeRequests: new Map(),
  remoteActivity: null,
};

export const EMPTY_MESSAGES: Message[] = [];
export const EMPTY_TOOL_CALLS: Map<string, ToolCallInfo> = new Map();
export const EMPTY_REQUESTS: Map<string, ActiveRequest> = new Map();

// AbortControllers are transient — kept outside the store so they're not
// serialized and so we can interrupt streams from anywhere.
const abortControllers = new Map<string, AbortController>();

export function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14).padEnd(12, '0');
}

interface ChatState {
  sessions: Record<string, SessionSlice>;

  // Slice management
  ensureSession: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  hasSession: (sessionId: string) => boolean;

  // Actions (all per-session)
  sendMessage: (sessionId: string, text: string) => Promise<void>;
  interruptStream: (sessionId: string) => void;
  clearMessages: (sessionId: string) => void;
  addMessage: (sessionId: string, message: Message) => void;
  updateMessage: (sessionId: string, id: string, updates: Partial<Message>) => void;
  loadMessages: (sessionId: string, msgs: Message[]) => void;

  appendStreamingContent: (sessionId: string, text: string) => void;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  finalizeStreamingMessage: (sessionId: string) => void;
  addToolCall: (sessionId: string, toolCall: ToolCallInfo) => void;
  updateToolCall: (sessionId: string, id: string, updates: Partial<ToolCallInfo>) => void;
  setStatus: (sessionId: string, kind: StatusKind, text: string) => void;

  addApprovalRequest: (sessionId: string, request: ApprovalRequest) => void;
  addClarifyRequest: (sessionId: string, request: ClarifyRequest) => void;
  addSudoRequest: (sessionId: string, request: SudoRequest) => void;
  addSecretRequest: (sessionId: string, request: SecretRequest) => void;
  trackRequest: (sessionId: string, requestId: string, type: ActiveRequest['type']) => void;
  resolveRequest: (sessionId: string, requestId: string) => void;

  handleToolStart: (sessionId: string, toolCall: ToolCallInfo) => void;
  handleToolComplete: (sessionId: string, toolId: string, updates: Partial<ToolCallInfo>) => void;
  handleToolProgress: (sessionId: string, toolName: string, preview: string) => void;

  setRemoteActivity: (sessionId: string, activity: import('@/api/types').SessionActivity | null) => void;

  recoverFromInterrupt: (sessionId: string) => void;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function convertApiMessages(apiMessages: SessionHistoryMessage[]): Message[] {
  return apiMessages.map((m, i) => ({
    id: `restored_${i}_${Date.now()}`,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp ?? Date.now(),
  }));
}

/**
 * Helper: returns a new state object with the named slice updated.
 * Auto-creates the slice if missing. Idempotent.
 */
function updateSlice(
  state: ChatState,
  sessionId: string,
  patch: Partial<SessionSlice> | ((slice: SessionSlice) => Partial<SessionSlice>)
): Pick<ChatState, 'sessions'> {
  const current = state.sessions[sessionId] ?? EMPTY_SLICE;
  const update = typeof patch === 'function' ? patch(current) : patch;
  return {
    sessions: {
      ...state.sessions,
      [sessionId]: { ...current, ...update },
    },
  };
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: {},

      ensureSession: (sessionId) => {
        if (!sessionId) return;
        set((state) => {
          if (state.sessions[sessionId]) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...EMPTY_SLICE,
                currentToolCalls: new Map(),
                activeRequests: new Map(),
                messages: [],
              },
            },
          };
        });
      },

      removeSession: (sessionId) => {
        // Cancel any in-flight stream
        abortControllers.get(sessionId)?.abort();
        abortControllers.delete(sessionId);
        set((state) => {
          if (!state.sessions[sessionId]) return state;
          const next = { ...state.sessions };
          delete next[sessionId];
          return { sessions: next };
        });
      },

      clearAllSessions: () => {
        for (const ctrl of abortControllers.values()) ctrl.abort();
        abortControllers.clear();
        set({ sessions: {} });
      },

      hasSession: (sessionId) => Boolean(get().sessions[sessionId]),

      sendMessage: async (sessionId: string, text: string) => {
        const { getClient } = useConnectionStore.getState();
        const client = getClient();
        if (!client) {
          console.error('No active connection');
          return;
        }

        // Make sure the slice exists
        get().ensureSession(sessionId);

        // Add user message and reset streaming state for this session
        const userMessage: Message = {
          id: generateMessageId(),
          role: 'user',
          content: text,
          timestamp: Date.now(),
        };
        const assistantId = generateMessageId();
        const assistantMessage: Message = {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
          toolCalls: [],
        };

        set((state) =>
          updateSlice(state, sessionId, (slice) => ({
            messages: [...slice.messages, userMessage, assistantMessage],
            isStreaming: true,
            streamingContent: '',
            currentToolCalls: new Map(),
            statusKind: 'thinking',
            statusText: 'Thinking...',
          }))
        );

        // Wire up an AbortController for this session
        const controller = new AbortController();
        abortControllers.get(sessionId)?.abort();
        abortControllers.set(sessionId, controller);

        try {
          // Build message history for the API (everything except the assistant
          // streaming placeholder we just added)
          const apiMessages = (get().sessions[sessionId]?.messages ?? [])
            .filter((m) => !m.isStreaming)
            .map((m) => ({ role: m.role, content: m.content }));

          const toolCallArgsAccumulator: Record<number, string> = {};

          for await (const event of client.chatCompletionsStream({
            sessionId,
            request: { messages: apiMessages, stream: true },
            signal: controller.signal,
          })) {
            if (event.type === 'chunk') {
              const chunk = event.data as ChatCompletionChunk;
              const delta = chunk.choices[0]?.delta;

              if (delta?.content) {
                set((state) =>
                  updateSlice(state, sessionId, (slice) => ({
                    streamingContent: slice.streamingContent + delta.content,
                  }))
                );
              }

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.function?.arguments) {
                    toolCallArgsAccumulator[tc.index] =
                      (toolCallArgsAccumulator[tc.index] || '') + tc.function.arguments;
                  }
                  const tcId = tc.id || `tool_${tc.index}`;
                  const existing = get().sessions[sessionId]?.currentToolCalls.get(tcId);
                  if (tc.function?.name && !existing) {
                    const toolCall: ToolCallInfo = {
                      id: tcId,
                      name: tc.function.name,
                      args: tc.function?.arguments || '',
                      argsPreview: getToolArgsPreview(tc.function?.arguments),
                      status: 'running',
                      startedAt: Date.now(),
                    };
                    get().addToolCall(sessionId, toolCall);
                  } else if (tc.function?.arguments) {
                    const accumulatedArgs = toolCallArgsAccumulator[tc.index];
                    get().updateToolCall(sessionId, tcId, {
                      args: accumulatedArgs,
                      argsPreview: getToolArgsPreview(accumulatedArgs),
                    });
                  }
                }
              }
            } else if (event.type === 'tool_progress') {
              const progress = event.data as ToolProgressEvent;
              set((state) =>
                updateSlice(state, sessionId, (slice) => {
                  const newToolCalls = new Map(slice.currentToolCalls);

                  if (progress.event === 'tool.started') {
                    const tc: ToolCallInfo = {
                      id: progress.tool_id || generateMessageId(),
                      name: progress.name,
                      preview: progress.preview,
                      status: 'running',
                      startedAt: Date.now(),
                    };
                    newToolCalls.set(tc.id, tc);
                    return {
                      currentToolCalls: newToolCalls,
                      statusKind: 'running' as const,
                      statusText: `Running ${progress.name}...`,
                    };
                  }

                  if (progress.event === 'tool.progress') {
                    for (const [id, tc] of newToolCalls) {
                      if (tc.name === progress.name && tc.status === 'running') {
                        newToolCalls.set(id, { ...tc, preview: progress.preview });
                      }
                    }
                    return { currentToolCalls: newToolCalls };
                  }

                  if (progress.event === 'tool.completed') {
                    for (const [id, tc] of newToolCalls) {
                      if (tc.name === progress.name && tc.status === 'running') {
                        newToolCalls.set(id, {
                          ...tc,
                          status: 'completed' as const,
                          duration_s: progress.duration_s,
                          summary: progress.summary,
                        });
                      }
                    }
                    return { currentToolCalls: newToolCalls };
                  }

                  if (progress.event === 'tool.failed') {
                    for (const [id, tc] of newToolCalls) {
                      if (tc.name === progress.name && tc.status === 'running') {
                        newToolCalls.set(id, { ...tc, status: 'failed' as const });
                      }
                    }
                    return { currentToolCalls: newToolCalls };
                  }

                  return { currentToolCalls: newToolCalls };
                })
              );
            } else if (event.type === 'done') {
              break;
            }
          }

          get().finalizeStreamingMessage(sessionId);
          set((state) =>
            updateSlice(state, sessionId, {
              isStreaming: false,
              statusKind: 'idle',
              statusText: '',
            })
          );
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            get().finalizeStreamingMessage(sessionId);
            set((state) =>
              updateSlice(state, sessionId, {
                isStreaming: false,
                statusKind: 'idle',
                statusText: 'Interrupted',
              })
            );
          } else {
            console.error('Stream error:', err);
            const slice = get().sessions[sessionId];
            const errorContent = slice?.streamingContent || '';
            set((state) =>
              updateSlice(state, sessionId, (s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: errorContent || `Error: ${(err as Error).message}`,
                        isStreaming: false,
                      }
                    : m
                ),
                isStreaming: false,
                statusKind: 'error',
                statusText: (err as Error).message,
                streamingContent: '',
              }))
            );
          }
        } finally {
          if (abortControllers.get(sessionId) === controller) {
            abortControllers.delete(sessionId);
          }
        }
      },

      interruptStream: (sessionId) => {
        const ctrl = abortControllers.get(sessionId);
        if (ctrl) ctrl.abort();
      },

      clearMessages: (sessionId) => {
        abortControllers.get(sessionId)?.abort();
        abortControllers.delete(sessionId);
        set((state) =>
          updateSlice(state, sessionId, {
            messages: [],
            isStreaming: false,
            streamingContent: '',
            currentToolCalls: new Map(),
            statusKind: 'idle',
            statusText: '',
            activeRequests: new Map(),
          })
        );
      },

      addMessage: (sessionId, message) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => ({
            messages: [
              ...slice.messages,
              { ...message, id: message.id || generateMessageId() },
            ],
          }))
        );
      },

      updateMessage: (sessionId, id, updates) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => ({
            messages: slice.messages.map((m) =>
              m.id === id ? { ...m, ...updates } : m
            ),
          }))
        );
      },

      loadMessages: (sessionId, msgs) => {
        set((state) => updateSlice(state, sessionId, { messages: msgs }));
      },

      appendStreamingContent: (sessionId, text) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => ({
            streamingContent: slice.streamingContent + text,
          }))
        );
      },

      setStreaming: (sessionId, streaming) => {
        set((state) => updateSlice(state, sessionId, { isStreaming: streaming }));
      },

      finalizeStreamingMessage: (sessionId) => {
        set((state) => {
          const slice = state.sessions[sessionId];
          if (!slice) return state;
          const streamingMsg = slice.messages.find((m) => m.isStreaming);
          if (!streamingMsg) return state;
          const toolCallsArray = Array.from(slice.currentToolCalls.values());
          return updateSlice(state, sessionId, {
            messages: slice.messages.map((m) =>
              m.id === streamingMsg.id
                ? {
                    ...m,
                    content: slice.streamingContent || m.content,
                    isStreaming: false,
                    toolCalls: toolCallsArray.length > 0 ? toolCallsArray : m.toolCalls,
                  }
                : m
            ),
            streamingContent: '',
            currentToolCalls: new Map(),
          });
        });
      },

      addToolCall: (sessionId, toolCall) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => {
            const next = new Map(slice.currentToolCalls);
            next.set(toolCall.id, toolCall);
            return { currentToolCalls: next };
          })
        );
      },

      updateToolCall: (sessionId, id, updates) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => {
            const next = new Map(slice.currentToolCalls);
            const tc = next.get(id);
            if (tc) next.set(id, { ...tc, ...updates });
            return { currentToolCalls: next };
          })
        );
      },

      setStatus: (sessionId, kind, text) => {
        set((state) =>
          updateSlice(state, sessionId, { statusKind: kind, statusText: text })
        );
      },

      addApprovalRequest: (sessionId, request) => {
        const msg: Message = {
          id: generateMessageId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          approvalRequest: request,
        };
        set((state) =>
          updateSlice(state, sessionId, (slice) => ({
            messages: [...slice.messages, msg],
          }))
        );
      },

      addClarifyRequest: (sessionId, request) => {
        const msg: Message = {
          id: generateMessageId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          clarifyRequest: request,
        };
        set((state) =>
          updateSlice(state, sessionId, (slice) => ({
            messages: [...slice.messages, msg],
          }))
        );
      },

      addSudoRequest: (sessionId, request) => {
        const msg: Message = {
          id: generateMessageId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          sudoRequest: request,
        };
        set((state) =>
          updateSlice(state, sessionId, (slice) => ({
            messages: [...slice.messages, msg],
          }))
        );
      },

      addSecretRequest: (sessionId, request) => {
        const msg: Message = {
          id: generateMessageId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          secretRequest: request,
        };
        set((state) =>
          updateSlice(state, sessionId, (slice) => ({
            messages: [...slice.messages, msg],
          }))
        );
      },

      trackRequest: (sessionId, requestId, type) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => {
            const next = new Map(slice.activeRequests);
            next.set(requestId, { type, resolved: false });
            return { activeRequests: next };
          })
        );
      },

      resolveRequest: (sessionId, requestId) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => {
            const nextActive = new Map(slice.activeRequests);
            const req = nextActive.get(requestId);
            if (req) nextActive.set(requestId, { ...req, resolved: true });

            const filteredMessages = slice.messages.filter((m) => {
              if (m.approvalRequest && m.approvalRequest.request_id === requestId) return false;
              if (m.clarifyRequest && m.clarifyRequest.request_id === requestId) return false;
              if (m.sudoRequest && m.sudoRequest.request_id === requestId) return false;
              if (m.secretRequest && m.secretRequest.request_id === requestId) return false;
              return true;
            });

            return { activeRequests: nextActive, messages: filteredMessages };
          })
        );
      },

      handleToolStart: (sessionId, toolCall) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => {
            const next = new Map(slice.currentToolCalls);
            next.set(toolCall.id, toolCall);
            return {
              currentToolCalls: next,
              statusKind: 'running' as const,
              statusText: `Running ${toolCall.name}...`,
            };
          })
        );
      },

      handleToolComplete: (sessionId, toolId, updates) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => {
            const next = new Map(slice.currentToolCalls);
            const tc = next.get(toolId);
            if (tc) next.set(toolId, { ...tc, ...updates });
            return { currentToolCalls: next };
          })
        );
      },

      handleToolProgress: (sessionId, toolName, preview) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => {
            const next = new Map(slice.currentToolCalls);
            for (const [id, tc] of next) {
              if (tc.name === toolName && tc.status === 'running') {
                next.set(id, { ...tc, preview });
                break;
              }
            }
            return { currentToolCalls: next, statusText: `Running ${toolName}...` };
          })
        );
      },

      setRemoteActivity: (sessionId, activity) => {
        set((state) =>
          updateSlice(state, sessionId, { remoteActivity: activity })
        );
      },

      recoverFromInterrupt: (sessionId) => {
        set((state) =>
          updateSlice(state, sessionId, (slice) => ({
            isStreaming: false,
            messages: slice.messages.map((m) =>
              m.isStreaming
                ? { ...m, content: slice.streamingContent || m.content, isStreaming: false }
                : m
            ),
            streamingContent: '',
            currentToolCalls: new Map(),
            statusKind: 'idle',
            statusText: '',
            activeRequests: new Map(),
          }))
        );
      },
    }),
    {
      name: 'hermes-chat',
      partialize: (state) => ({
        // Persist serializable view of the sessions map
        sessions: Object.fromEntries(
          Object.entries(state.sessions).map(([sid, slice]) => [
            sid,
            {
              ...slice,
              currentToolCalls: Array.from(slice.currentToolCalls.entries()),
              activeRequests: Array.from(slice.activeRequests.entries()),
            },
          ])
        ),
      }),
      merge: (persistedState, currentState) => {
        const ps = persistedState as Record<string, unknown> | null;
        if (!ps || typeof ps.sessions !== 'object' || ps.sessions === null) {
          return currentState;
        }
        const restored: Record<string, SessionSlice> = {};
        for (const [sid, raw] of Object.entries(ps.sessions as Record<string, unknown>)) {
          const r = raw as Record<string, unknown>;
          restored[sid] = {
            messages: (r.messages as Message[]) ?? [],
            isStreaming: false,
            streamingContent: '',
            currentToolCalls: r.currentToolCalls
              ? new Map(r.currentToolCalls as [string, ToolCallInfo][])
              : new Map(),
            statusKind: 'idle',
            statusText: '',
            activeRequests: r.activeRequests
              ? new Map(r.activeRequests as [string, ActiveRequest][])
              : new Map(),
            remoteActivity: null,
          };
        }
        return { ...currentState, sessions: restored };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // For each session that was streaming, fetch latest history from server
        // — the SSE stream is dead after a reload.
        const client = useConnectionStore.getState().client;
        if (!client) return;

        for (const [sid, slice] of Object.entries(state.sessions)) {
          if (!slice.messages.some((m) => m.isStreaming)) continue;
          client
            .getSessionHistory(sid)
            .then((history) => {
              const apiMessages = history.messages || [];
              if (apiMessages.length > 0) {
                state.loadMessages(sid, convertApiMessages(apiMessages));
              }
              state.setStreaming(sid, false);
              state.setStatus(sid, 'idle', '');
            })
            .catch(() => {
              state.recoverFromInterrupt(sid);
            });
        }
      },
    }
  )
);

// ─── Selector helpers (use these in components for stable subscriptions) ───

export const selectSlice = (sessionId: string | null | undefined) =>
  (state: { sessions: Record<string, SessionSlice> }) =>
    sessionId ? state.sessions[sessionId] : undefined;

export const useSessionMessages = (sessionId: string | null | undefined): Message[] =>
  useChatStore((s) => (sessionId ? s.sessions[sessionId]?.messages : undefined) ?? EMPTY_MESSAGES);

export const useSessionIsStreaming = (sessionId: string | null | undefined): boolean =>
  useChatStore((s) => Boolean(sessionId && s.sessions[sessionId]?.isStreaming));

export const useSessionStreamingContent = (sessionId: string | null | undefined): string =>
  useChatStore((s) => (sessionId ? s.sessions[sessionId]?.streamingContent : '') ?? '');

export const useSessionStatusKind = (sessionId: string | null | undefined): StatusKind =>
  useChatStore((s) => (sessionId ? s.sessions[sessionId]?.statusKind : 'idle') ?? 'idle');

export const useSessionStatusText = (sessionId: string | null | undefined): string =>
  useChatStore((s) => (sessionId ? s.sessions[sessionId]?.statusText : '') ?? '');

export const useSessionToolCalls = (sessionId: string | null | undefined): Map<string, ToolCallInfo> =>
  useChatStore((s) => (sessionId ? s.sessions[sessionId]?.currentToolCalls : undefined) ?? EMPTY_TOOL_CALLS);

export const useSessionRemoteActivity = (sessionId: string | null | undefined): import('@/api/types').SessionActivity | null =>
  useChatStore((s) => (sessionId ? s.sessions[sessionId]?.remoteActivity : undefined) ?? null);
