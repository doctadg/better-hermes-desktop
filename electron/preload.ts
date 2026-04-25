/**
 * Preload — secure renderer ↔ main bridge via contextBridge.
 *
 * Surfaces a single typed object on `window.hermesAPI`:
 *   - window controls
 *   - generic store (KV)
 *   - SQLite-backed sessions / messages / models / workspaces / audit
 *   - electron-updater controls + push events
 *
 * Generic `invoke()` is also exposed so feature work can land new handlers
 * without round-tripping the preload type.
 */

import { contextBridge, ipcRenderer } from 'electron';

// ─── Types ───

export interface SessionRow {
  id: string;
  profile: string | null;
  source: string | null;
  started_at: number | null;
  ended_at: number | null;
  message_count: number;
  model: string | null;
  title: string | null;
  updated_at: number;
}

export interface ModelRow {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string | null;
  created_at: number;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  layout: string;
  created_at: number;
  updated_at: number;
}

export interface SearchHit {
  session_id: string;
  role: string;
  timestamp: number;
  snippet: string;
  session_title: string | null;
  session_started_at: number | null;
}

export interface AuditRow {
  id: string;
  kind: string;
  request_id: string | null;
  session_id: string | null;
  decision: string | null;
  payload: string | null;
  created_at: number;
}

export interface UpdateInfo {
  version?: string;
  releaseName?: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export interface DownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface HermesElectronAPI {
  // Window
  minimize: () => Promise<void>;
  maximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onWindowStateChanged: (cb: (maximized: boolean) => void) => () => void;

  // Platform
  getPlatform: () => string;
  getVersion: () => Promise<string>;
  readonly isElectron: boolean;

  // Generic KV
  storeGet: <T = unknown>(key: string) => Promise<T | undefined>;
  storeSet: (key: string, value: unknown) => Promise<void>;

  // Sessions cache
  sessions: {
    upsert: (s: Partial<SessionRow> & { id: string }) => Promise<void>;
    list: (opts?: { profile?: string | null; limit?: number; offset?: number }) => Promise<SessionRow[]>;
    remove: (id: string) => Promise<void>;
    messages: (sessionId: string) => Promise<Array<{ id: string; role: string; content: string; timestamp: number }>>;
  };

  // Messages
  messages: {
    insert: (m: { id: string; session_id: string; role: string; content: string; timestamp: number }) => Promise<void>;
    search: (query: string, opts?: { limit?: number; profile?: string | null }) => Promise<SearchHit[]>;
  };

  // Model library CRUD
  models: {
    list: () => Promise<ModelRow[]>;
    add: (m: Omit<ModelRow, 'created_at'>) => Promise<void>;
    update: (m: Omit<ModelRow, 'created_at'>) => Promise<void>;
    remove: (id: string) => Promise<void>;
  };

  // Workspaces
  workspaces: {
    list: () => Promise<WorkspaceRow[]>;
    save: (w: { id: string; name: string; layout: unknown }) => Promise<void>;
    remove: (id: string) => Promise<void>;
  };

  // Audit
  audit: {
    append: (entry: {
      id: string;
      kind: string;
      request_id?: string | null;
      session_id?: string | null;
      decision?: string | null;
      payload?: unknown;
    }) => Promise<void>;
    list: (opts?: { kind?: string; limit?: number }) => Promise<AuditRow[]>;
  };

  // Updater
  updater: {
    check: () => Promise<unknown>;
    download: () => Promise<unknown>;
    install: () => Promise<unknown>;
    onChecking: (cb: () => void) => () => void;
    onAvailable: (cb: (info: UpdateInfo) => void) => () => void;
    onNotAvailable: (cb: (info: UpdateInfo) => void) => () => void;
    onProgress: (cb: (p: DownloadProgress) => void) => () => void;
    onDownloaded: (cb: (info: UpdateInfo) => void) => () => void;
    onError: (cb: (err: { message: string }) => void) => () => void;
  };

  // Escape hatch
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

// ─── Event subscription helper ───
function on<T = unknown>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
    callback(payload as T);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

// ─── Build and expose the API ───
const api: HermesElectronAPI = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowStateChanged: (cb) => on<boolean>('window:state-changed', cb),

  getPlatform: () => process.platform,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  isElectron: true,

  storeGet: <T = unknown>(key: string) => ipcRenderer.invoke('store:get', key) as Promise<T | undefined>,
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),

  sessions: {
    upsert: (s) => ipcRenderer.invoke('db:sessions:upsert', s),
    list: (opts) => ipcRenderer.invoke('db:sessions:list', opts) as Promise<SessionRow[]>,
    remove: (id) => ipcRenderer.invoke('db:sessions:delete', id),
    messages: (id) => ipcRenderer.invoke('db:sessions:messages', id) as Promise<Array<{ id: string; role: string; content: string; timestamp: number }>>,
  },

  messages: {
    insert: (m) => ipcRenderer.invoke('db:messages:insert', m),
    search: (q, opts) => ipcRenderer.invoke('db:messages:search', q, opts) as Promise<SearchHit[]>,
  },

  models: {
    list: () => ipcRenderer.invoke('db:models:list') as Promise<ModelRow[]>,
    add: (m) => ipcRenderer.invoke('db:models:add', m),
    update: (m) => ipcRenderer.invoke('db:models:update', m),
    remove: (id) => ipcRenderer.invoke('db:models:remove', id),
  },

  workspaces: {
    list: () => ipcRenderer.invoke('db:workspaces:list') as Promise<WorkspaceRow[]>,
    save: (w) => ipcRenderer.invoke('db:workspaces:save', w),
    remove: (id) => ipcRenderer.invoke('db:workspaces:delete', id),
  },

  audit: {
    append: (entry) => ipcRenderer.invoke('db:audit:append', entry),
    list: (opts) => ipcRenderer.invoke('db:audit:list', opts) as Promise<AuditRow[]>,
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onChecking: (cb) => on<void>('updater:checking', () => cb()),
    onAvailable: (cb) => on<UpdateInfo>('updater:available', cb),
    onNotAvailable: (cb) => on<UpdateInfo>('updater:not-available', cb),
    onProgress: (cb) => on<DownloadProgress>('updater:progress', cb),
    onDownloaded: (cb) => on<UpdateInfo>('updater:downloaded', cb),
    onError: (cb) => on<{ message: string }>('updater:error', cb),
  },

  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('hermesAPI', api);
