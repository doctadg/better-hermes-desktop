/**
 * Hermes Desktop — IPC Handlers.
 *
 * Each handler is registered via ipcMain.handle() for promise-based comms.
 * Store access is injected to keep the module decoupled from the store impl.
 *
 * Domains:
 *   window:*       — frame controls
 *   app:*          — platform info
 *   store:*        — generic KV (electron-store-style)
 *   db:sessions:*  — local session cache (mirror of /api/sessions)
 *   db:messages:*  — message storage + FTS5 search
 *   db:models:*    — saved-model CRUD (model library)
 *   db:workspaces:*— saved pane layouts
 *   db:audit:*     — request-gate audit log
 *   updater:*      — registered separately by updater.ts
 */

import { ipcMain, BrowserWindow } from 'electron';
import {
  upsertSession,
  listSessions,
  deleteSession,
  insertMessage,
  getSessionMessages,
  searchMessages,
  listModels,
  addModel,
  updateModel,
  removeModel,
  listWorkspaces,
  saveWorkspace,
  deleteWorkspace,
  appendAudit,
  listAudit,
  type SessionRow,
  type ModelRow,
} from './db';

type StoreGetter = <T = unknown>(key: string) => T | undefined;
type StoreSetter = (key: string, value: unknown) => void;

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] || null;
}

export function registerIPCHandlers(storeGet: StoreGetter, storeSet: StoreSetter): void {
  // ─── Window controls ───
  ipcMain.handle('window:minimize', async () => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle('window:maximize', async () => {
    const win = getMainWindow();
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });

  ipcMain.handle('window:close', async () => {
    getMainWindow()?.close();
  });

  ipcMain.handle('window:is-maximized', async () => getMainWindow()?.isMaximized() ?? false);

  // ─── Platform ───
  ipcMain.handle('app:get-platform', async () => process.platform);
  ipcMain.handle('app:get-version', async () => {
    // Avoid require-cycle on app — read via electron API at call time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    return app.getVersion();
  });

  // ─── Generic store ───
  ipcMain.handle('store:get', async (_e, key: string) => {
    if (typeof key !== 'string') throw new Error('store:get requires a string key');
    return storeGet(key);
  });
  ipcMain.handle('store:set', async (_e, key: string, value: unknown) => {
    if (typeof key !== 'string') throw new Error('store:set requires a string key');
    storeSet(key, value);
  });

  // ─── Sessions cache ───
  ipcMain.handle('db:sessions:upsert', async (_e, s: Partial<SessionRow> & { id: string }) => {
    upsertSession(s);
  });
  ipcMain.handle('db:sessions:list', async (_e, opts?: { profile?: string | null; limit?: number; offset?: number }) =>
    listSessions(opts ?? {}),
  );
  ipcMain.handle('db:sessions:delete', async (_e, id: string) => {
    deleteSession(id);
  });
  ipcMain.handle('db:sessions:messages', async (_e, sessionId: string) => getSessionMessages(sessionId));

  // ─── Messages ───
  ipcMain.handle(
    'db:messages:insert',
    async (
      _e,
      m: { id: string; session_id: string; role: string; content: string; timestamp: number },
    ) => {
      insertMessage(m);
    },
  );
  ipcMain.handle('db:messages:search', async (_e, query: string, opts?: { limit?: number; profile?: string | null }) =>
    searchMessages(query, opts ?? {}),
  );

  // ─── Model library CRUD ───
  ipcMain.handle('db:models:list', async () => listModels());
  ipcMain.handle('db:models:add', async (_e, m: Omit<ModelRow, 'created_at'>) => {
    addModel(m);
  });
  ipcMain.handle('db:models:update', async (_e, m: Omit<ModelRow, 'created_at'>) => {
    updateModel(m);
  });
  ipcMain.handle('db:models:remove', async (_e, id: string) => {
    removeModel(id);
  });

  // ─── Workspaces ───
  ipcMain.handle('db:workspaces:list', async () => listWorkspaces());
  ipcMain.handle('db:workspaces:save', async (_e, w: { id: string; name: string; layout: unknown }) => {
    saveWorkspace(w);
  });
  ipcMain.handle('db:workspaces:delete', async (_e, id: string) => {
    deleteWorkspace(id);
  });

  // ─── Audit log ───
  ipcMain.handle(
    'db:audit:append',
    async (
      _e,
      entry: {
        id: string;
        kind: string;
        request_id?: string | null;
        session_id?: string | null;
        decision?: string | null;
        payload?: unknown;
      },
    ) => {
      appendAudit(entry);
    },
  );
  ipcMain.handle('db:audit:list', async (_e, opts?: { kind?: string; limit?: number }) => listAudit(opts ?? {}));
}
