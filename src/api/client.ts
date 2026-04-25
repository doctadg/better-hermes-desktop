/**
 * Hermes Desktop - HTTP/SSE API Client
 * Connects to the Hermes api_server (OpenAI-compatible)
 */

import type {
  ChatCompletionRequest,
  ChatCompletionChunk,
  SSEEvent,
  ToolProgressEvent,
  ModelsResponse,
  HealthResponse,
  SessionListResponse,
  SessionDetail,
  SessionHistoryResponse,
  SessionActivity,
  ConfigResponse,
  ConfigModelsResponse,
  CommandCatalogResponse,
  DispatchCommandRequest,
  DispatchCommandResponse,
  ServerConfig,
  MemoryResponse,
  MemoryUpdateRequest,
  SoulResponse,
  SoulUpdateRequest,
  SkillsResponse,
  ToolsetsResponse,
  CronJobsResponse,
  CronJobCreate,
  CronJob,
  GatewayStatusResponse,
  BridgeProfilesResponse,
  BridgeProfileHealth,
  SystemInfo,
} from './types';

// ─── SSE Stream Parser ───
export async function* parseSSEStream(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    let currentData = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6);
        if (currentData.trim() === '[DONE]') {
          yield { event: 'done', data: '' };
        } else {
          yield { event: currentEvent || 'message', data: currentData };
        }
        currentEvent = '';
        currentData = '';
      } else if (line.trim() === '') {
        // Empty line resets event type
        currentEvent = '';
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    const lines = buffer.split('\n');
    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data.trim() === '[DONE]') {
          yield { event: 'done', data: '' };
        } else {
          yield { event: currentEvent || 'message', data };
        }
      }
    }
  }
}

// ─── API Client ───
//
// Stateless w.r.t. session id — the caller passes a sessionId per request
// when one is relevant (chat completions, history, WebSocket URL). The client
// still tracks `profile` because it's an account-level setting that applies
// to every request, not per-session.
export class HermesClient {
  private baseUrl: string;
  private token: string;
  private profile: string | null = null;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  setProfile(name: string | null) {
    this.profile = name;
  }

  getProfile(): string | null {
    return this.profile;
  }

  private getHeaders(sessionId?: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };
    if (this.profile) {
      headers['X-Hermes-Profile'] = this.profile;
    }
    if (sessionId) {
      headers['X-Hermes-Session-Id'] = sessionId;
    }
    return headers;
  }

  // ─── Health Check ───
  async healthCheck(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json();
  }

  // ─── Models ───
  async listModels(): Promise<ModelsResponse> {
    const res = await fetch(`${this.baseUrl}/v1/models`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to list models: ${res.status}`);
    return res.json();
  }

  // ─── Chat Completions (SSE Streaming) ───
  async *chatCompletionsStream(opts: {
    sessionId: string;
    request: ChatCompletionRequest;
    signal?: AbortSignal;
  }): AsyncGenerator<
    | { type: 'chunk'; data: ChatCompletionChunk }
    | { type: 'tool_progress'; data: ToolProgressEvent }
    | { type: 'done' }
  > {
    const { sessionId, request, signal } = opts;
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(sessionId),
      body: JSON.stringify({ ...request, stream: true, session_id: sessionId }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Chat completions failed: ${res.status} ${text}`);
    }

    for await (const sseEvent of parseSSEStream(res)) {
      if (sseEvent.event === 'done') {
        yield { type: 'done' };
        break;
      }

      if (sseEvent.event === 'hermes.tool.progress') {
        try {
          const data = JSON.parse(sseEvent.data) as ToolProgressEvent;
          yield { type: 'tool_progress', data };
        } catch {
          // Skip malformed events
        }
        continue;
      }

      try {
        const data = JSON.parse(sseEvent.data) as ChatCompletionChunk;
        yield { type: 'chunk', data };
      } catch {
        // Skip malformed events
      }
    }
  }

  // ─── Chat Completions (non-streaming) ───
  async chatCompletions(sessionId: string, request: ChatCompletionRequest) {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(sessionId),
      body: JSON.stringify({ ...request, stream: false, session_id: sessionId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Chat completions failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  // ─── Responses API ───
  async createResponse(request: Record<string, unknown>) {
    const res = await fetch(`${this.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Responses API failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  // ─── Sessions API ───
  async listSessions(): Promise<SessionListResponse> {
    const res = await fetch(`${this.baseUrl}/api/sessions`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
    return res.json();
  }

  async getSession(id: string): Promise<SessionDetail> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(id)}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get session: ${res.status}`);
    return res.json();
  }

  async getSessionHistory(id: string): Promise<SessionHistoryResponse> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(id)}/messages`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get session history: ${res.status}`);
    return res.json();
  }

  async deleteSession(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`);
  }

  // ─── Session Activity ───
  async getSessionActivity(id: string): Promise<SessionActivity> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(id)}/activity`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get session activity: ${res.status}`);
    return res.json();
  }

  // ─── Config API ───
  async getConfig(): Promise<ConfigResponse> {
    const res = await fetch(`${this.baseUrl}/api/config`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get config: ${res.status}`);
    return res.json();
  }

  async patchConfig(updates: Partial<ServerConfig>): Promise<ConfigResponse> {
    const res = await fetch(`${this.baseUrl}/api/config`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Failed to update config: ${res.status}`);
    return res.json();
  }

  async getAvailableModels(): Promise<ConfigModelsResponse> {
    const res = await fetch(`${this.baseUrl}/api/config/models`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get models: ${res.status}`);
    return res.json();
  }

  // ─── Commands API ───
  async dispatchCommand(request: DispatchCommandRequest): Promise<DispatchCommandResponse> {
    const res = await fetch(`${this.baseUrl}/api/commands/dispatch`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`Failed to dispatch command: ${res.status}`);
    return res.json();
  }

  async getCommands(): Promise<CommandCatalogResponse> {
    const res = await fetch(`${this.baseUrl}/api/commands/catalog`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get commands: ${res.status}`);
    return res.json();
  }

  // ─── Memory API ───
  async getMemory(): Promise<MemoryResponse> {
    const res = await fetch(`${this.baseUrl}/api/memory`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get memory: ${res.status}`);
    return res.json();
  }

  async patchMemory(data: MemoryUpdateRequest): Promise<MemoryResponse> {
    const res = await fetch(`${this.baseUrl}/api/memory`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update memory: ${res.status}`);
    return res.json();
  }

  async getUserProfile(): Promise<MemoryResponse> {
    const res = await fetch(`${this.baseUrl}/api/memory/user`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get user profile: ${res.status}`);
    return res.json();
  }

  async patchUserProfile(data: MemoryUpdateRequest): Promise<MemoryResponse> {
    const res = await fetch(`${this.baseUrl}/api/memory/user`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update user profile: ${res.status}`);
    return res.json();
  }

  // ─── Soul API ───
  async getSoul(): Promise<SoulResponse> {
    const res = await fetch(`${this.baseUrl}/api/soul`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get soul: ${res.status}`);
    return res.json();
  }

  async patchSoul(data: SoulUpdateRequest): Promise<SoulResponse> {
    const res = await fetch(`${this.baseUrl}/api/soul`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update soul: ${res.status}`);
    return res.json();
  }

  // ─── Skills API ───
  async getSkills(): Promise<SkillsResponse> {
    const res = await fetch(`${this.baseUrl}/api/skills`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get skills: ${res.status}`);
    return res.json();
  }

  async toggleSkill(name: string, enabled: boolean): Promise<SkillsResponse> {
    const res = await fetch(`${this.baseUrl}/api/skills/toggle`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ name, enabled }),
    });
    if (!res.ok) throw new Error(`Failed to toggle skill: ${res.status}`);
    return res.json();
  }

  // ─── Toolsets API (read-only) ───
  async getToolsets(): Promise<ToolsetsResponse> {
    const res = await fetch(`${this.baseUrl}/api/tools/toolsets`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get toolsets: ${res.status}`);
    return res.json();
  }

  // ─── Cron Jobs API ───
  async getCronJobs(): Promise<CronJobsResponse> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get cron jobs: ${res.status}`);
    return res.json();
  }

  async createCronJob(data: CronJobCreate): Promise<CronJob> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to create cron job: ${res.status}`);
    return res.json();
  }

  async deleteCronJob(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to delete cron job: ${res.status}`);
  }

  async patchCronJob(id: string, data: Partial<CronJob>): Promise<CronJob> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update cron job: ${res.status}`);
    return res.json();
  }

  async pauseCronJob(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to pause cron job: ${res.status}`);
  }

  async resumeCronJob(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs/${encodeURIComponent(id)}/resume`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to resume cron job: ${res.status}`);
  }

  async triggerCronJob(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/cron/jobs/${encodeURIComponent(id)}/trigger`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to trigger cron job: ${res.status}`);
  }

  // ─── Gateway API ───
  async getGatewayStatus(): Promise<GatewayStatusResponse> {
    const res = await fetch(`${this.baseUrl}/api/gateway/status`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get gateway status: ${res.status}`);
    return res.json();
  }

  // ─── Bridge API ───
  async getBridgeProfiles(): Promise<BridgeProfilesResponse> {
    const res = await fetch(`${this.baseUrl}/api/profiles`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get bridge profiles: ${res.status}`);
    return res.json();
  }

  async getBridgeProfileHealth(name: string): Promise<BridgeProfileHealth> {
    const res = await fetch(`${this.baseUrl}/api/profiles/${encodeURIComponent(name)}/health`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get profile health: ${res.status}`);
    return res.json();
  }

  // ─── System Info API ───
  async getSystemInfo(): Promise<SystemInfo> {
    const res = await fetch(`${this.baseUrl}/api/system/info`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get system info: ${res.status}`);
    return res.json();
  }

  // ─── WebSocket URL ───
  getWebSocketUrl(sessionId: string): string {
    const wsBase = this.baseUrl.replace(/^http/, 'ws');
    const params = new URLSearchParams();
    params.set('token', this.token);
    params.set('session_id', sessionId);
    if (this.profile) params.set('profile', this.profile);
    return `${wsBase}/ws?${params.toString()}`;
  }
}
