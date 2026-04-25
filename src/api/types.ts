/**
 * Hermes Desktop - API Types
 * All types for the OpenAI-compatible Hermes API server
 */

// ─── Connection ───
export interface ServerConnection {
  id: string;
  label: string;
  url: string;
  token: string;
  active: boolean;
  lastConnected?: string;
}

// ─── SSE Events ───
export interface SSEEvent {
  event: string;
  data: string;
}

// ─── Chat Completions ───
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  session_id?: string;
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: ToolCallDelta[];
    };
    finish_reason: string | null;
  }>;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

// ─── Tool Progress ───
export interface ToolProgressEvent {
  event: 'tool.started' | 'tool.progress' | 'tool.completed' | 'tool.failed';
  name: string;
  preview?: string;
  tool_id?: string;
  duration_s?: number;
  summary?: string;
  error?: string;
}

// ─── WebSocket Messages ───

// Server → Client (requests)
export interface ApprovalRequest {
  type: 'approval.request';
  request_id: string;
  command: string;
  pattern_key: string;
}

export interface ClarifyRequest {
  type: 'clarify.request';
  request_id: string;
  question: string;
  choices: string[];
}

export interface SudoRequest {
  type: 'sudo.request';
  request_id: string;
}

export interface SecretRequest {
  type: 'secret.request';
  request_id: string;
  env_var: string;
  prompt: string;
}

export type WSClientRequest = ApprovalRequest | ClarifyRequest | SudoRequest | SecretRequest;

// Client → Server (responses)
export interface ApprovalResponse {
  type: 'approval.respond';
  request_id: string;
  choice: 'approve' | 'deny';
}

export interface ClarifyResponse {
  type: 'clarify.respond';
  request_id: string;
  answer: string;
}

export interface SudoResponse {
  type: 'sudo.respond';
  request_id: string;
  password: string;
}

export interface SecretResponse {
  type: 'secret.respond';
  request_id: string;
  value: string;
}

export type WSServerResponse = ApprovalResponse | ClarifyResponse | SudoResponse | SecretResponse;

// Server → Client (real-time events)
export interface ToolStartEvent {
  type: 'tool.start';
  tool_id: string;
  name: string;
  context?: string;
}

export interface ToolCompleteEvent {
  type: 'tool.complete';
  tool_id: string;
  name: string;
  duration_s: number;
  summary?: string;
}

export interface ToolProgressWSEvent {
  type: 'tool.progress';
  name: string;
  preview: string;
}

export interface StatusUpdateEvent {
  type: 'status.update';
  kind: 'thinking' | 'running' | 'idle' | 'error';
  text: string;
}

export interface MessageDeltaEvent {
  type: 'message.delta';
  text: string;
}

export interface MessageCompleteEvent {
  type: 'message.complete';
  text: string;
  usage?: Record<string, unknown>;
}

export interface SessionInfoEvent {
  type: 'session.info';
  model: string;
  tools?: Record<string, unknown>;
  usage?: Record<string, unknown>;
}

export type WSRealtimeEvent =
  | ToolStartEvent
  | ToolCompleteEvent
  | ToolProgressWSEvent
  | StatusUpdateEvent
  | MessageDeltaEvent
  | MessageCompleteEvent
  | SessionInfoEvent;

export type WSMessage = WSClientRequest | WSRealtimeEvent;

// ─── UI Message Model ───
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  sessionId?: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallInfo[];
  approvalRequest?: ApprovalRequest;
  clarifyRequest?: ClarifyRequest;
  sudoRequest?: SudoRequest;
  secretRequest?: SecretRequest;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args?: string;          // raw JSON string of arguments
  argsPreview?: string;   // short preview of arguments (e.g. "path: src/index.ts")
  preview?: string;       // tool output preview
  status: 'running' | 'completed' | 'failed';
  duration_s?: number;
  summary?: string;
  error?: string;         // for failed tools
  startedAt: number;
}

export function getToolArgsPreview(args: string | undefined): string | undefined {
  if (!args) return undefined;
  try {
    const parsed = JSON.parse(args);
    // Extract most relevant field
    const keys = Object.keys(parsed);
    if (keys.length === 0) return undefined;
    // Prefer these keys for preview
    const preferred = ['path', 'command', 'query', 'pattern', 'url', 'file_path', 'name', 'content', 'prompt', 'question', 'text', 'code'];
    for (const key of preferred) {
      if (parsed[key]) {
        const val = String(parsed[key]);
        if (val.length > 80) return `${key}: ${val.slice(0, 77)}...`;
        return `${key}: ${val}`;
      }
    }
    // Fallback: first key
    const firstKey = keys[0];
    const val = String(parsed[firstKey]);
    if (val.length > 80) return `${firstKey}: ${val.slice(0, 77)}...`;
    return `${firstKey}: ${val}`;
  } catch {
    return args.length > 80 ? args.slice(0, 77) + '...' : args;
  }
}

// ─── Session (API format) ───
export interface Session {
  id: string;
  title: string | null;
  source?: string;
  model?: string;
  last_active: number;
  message_count: number;
  started_at: number;
  preview?: string;
  is_active?: boolean;
}

// ─── Session Details (full) ───
export interface SessionDetail extends Session {
  // any extra fields from GET /api/sessions/{id}
}

// ─── Session History Message ───
export interface SessionHistoryMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: number;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

// ─── API Responses ───
export interface SessionListResponse {
  sessions: Session[];
}

export interface SessionHistoryResponse {
  messages: SessionHistoryMessage[];
  session_id?: string;
}

export interface ServerConfig {
  model?: string;
  model_name?: string;
  verbose?: boolean;
  yolo?: boolean;
  profile?: string;
  skin?: string;
  active_tools?: string[];
  [key: string]: unknown;
}

export interface ConfigResponse {
  config: ServerConfig;
}

export interface ConfigModelsResponse {
  models: string[];
}

export interface CommandInfo {
  name: string;
  description: string;
  category?: string;
  aliases?: string[];
  args_hint?: string;
  subcommands?: CommandInfo[];
}

export interface CommandCatalogResponse {
  commands: CommandInfo[];
}

export interface DispatchCommandRequest {
  command: string;
  args?: string;
  session_id?: string;
}

export interface DispatchCommandResponse {
  success: boolean;
  message?: string;
  data?: unknown;
}

// ─── Models ───
export interface ModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  object: 'list';
  data: ModelInfo[];
}

// ─── Health ───
export interface HealthResponse {
  status: string;
  version?: string;
  uptime?: number;
}

// ─── Memory ───
export interface ProfileFileResponse {
  file: string;
  content: string;
  line_count: number;
  char_count: number;
  last_modified: string | null;
}

export interface MemoryResponse {
  file: string;
  content: string;
  line_count: number;
  char_count: number;
  last_modified: string | null;
}

export interface MemoryUpdateRequest {
  content: string;
}

// ─── Soul ───
export interface SoulResponse {
  file: string;
  content: string;
  line_count: number;
  char_count: number;
  last_modified: string | null;
}

export interface SoulUpdateRequest {
  content: string;
}

// ─── Skills ───
export interface SkillInfo {
  name: string;
  description: string;
  category: string | null;
  enabled: boolean;
}

export type SkillsResponse = SkillInfo[];

// ─── Toolsets ───
export interface ToolsetTool {
  name: string;
  description?: string;
}

export interface ToolsetInfo {
  name: string;
  label?: string;
  description: string;
  enabled: boolean;
  available: boolean;
  configured: boolean;
  tools: ToolsetTool[];
}

export type ToolsetsResponse = ToolsetInfo[];

// ─── Cron Jobs ───
export interface CronJobCreate {
  name?: string;
  prompt: string;
  schedule: string;
  deliver?: string;
}

export interface CronJob {
  id: string;
  name: string;
  prompt: string;
  skills?: string[];
  skill?: string | null;
  model?: string | null;
  provider?: string | null;
  base_url?: string | null;
  schedule: {
    kind: string;
    expr: string;
    tz?: string;
    display?: string;
  };
  schedule_display: string;
  repeat: {
    times: number | null;
    completed: number;
  };
  enabled: boolean;
  state: string;
  paused_at: string | null;
  paused_reason: string | null;
  created_at: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  deliver?: string | null;
  origin?: {
    platform?: string;
    chat_id?: string;
    thread_id?: string;
  };
}

export type CronJobsResponse = CronJob[];

// ─── Gateway ───
export interface GatewayStatusResponse {
  gateway_running: boolean;
  platforms: { name: string; enabled: boolean; connected: boolean }[];
  uptime?: number;
}

// ─── Bridge Profile ───
export interface BridgeProfile {
  name: string;
  url: string;
  status: 'up' | 'down' | 'degraded';
  is_default: boolean;
  auth_mode: 'passthrough' | 'key_configured';
}

export interface BridgeProfilesResponse {
  default_profile: string;
  profiles: BridgeProfile[];
}

export interface BridgeProfileHealth {
  profile: string;
  url: string;
  status: 'up' | 'down' | 'degraded';
  backend_status_code?: number;
  backend_response?: unknown;
  error?: string;
}

export interface BridgeStatusResponse {
  version: string;
  uptime_seconds: number;
  host: string;
  port: number;
  default_profile: string;
  auth_enabled: boolean;
  num_profiles: number;
  profiles: Array<{
    name: string;
    url: string;
    status: string;
    last_health_check: number;
  }>;
}

// ─── IPC Commands ───
export interface IPCCommand {
  type: string;
  payload?: unknown;
}

export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Window API (from preload) ───
export interface ConnectionConfig {
  url: string;
  token: string;
  label?: string;
}

export interface HermesAPI {
  // Connection
  connect: (config: ConnectionConfig) => Promise<IPCResponse>;
  disconnect: () => Promise<IPCResponse>;
  getConnectionStatus: () => Promise<IPCResponse>;

  // Chat
  sendMessage: (text: string, sessionId?: string) => Promise<IPCResponse>;

  // Callback Responses
  respondApproval: (requestId: string, choice: 'approve' | 'deny') => Promise<IPCResponse>;
  respondClarify: (requestId: string, answer: string) => Promise<IPCResponse>;
  respondSudo: (requestId: string, password: string) => Promise<IPCResponse>;
  respondSecret: (requestId: string, value: string) => Promise<IPCResponse>;

  // Events from main → renderer
  onStreamingToken: (callback: (data: unknown) => void) => () => void;
  onToolProgress: (callback: (data: unknown) => void) => () => void;
  onCallbackRequest: (callback: (data: unknown) => void) => () => void;
  onStatusUpdate: (callback: (data: unknown) => void) => () => void;
  onConnectionChange: (callback: (data: unknown) => void) => () => void;

  // Window Controls
  minimize: () => Promise<IPCResponse>;
  maximize: () => Promise<IPCResponse>;
  close: () => Promise<IPCResponse>;
  isMaximized: () => Promise<IPCResponse>;

  // System
  showNotification: (title: string, body: string) => Promise<IPCResponse>;
  getPlatform: () => string;

  // Credential Storage
  storeCredential: (key: string, value: string) => Promise<IPCResponse>;
  getCredential: (key: string) => Promise<IPCResponse>;
  deleteCredential: (key: string) => Promise<IPCResponse>;

  // Generic invoke
  invoke: (command: string, payload?: unknown) => Promise<unknown>;

  // Platform info
  platform: string;
  isElectron: boolean;
}

declare global {
  interface Window {
    hermesAPI: HermesAPI;
  }
}
