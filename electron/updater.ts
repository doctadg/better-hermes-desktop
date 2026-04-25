/**
 * Auto-update wiring (electron-updater + GitHub Releases).
 *
 * Only runs in packaged builds; dev sessions skip silently.
 * Renderer subscribes via `updater:*` IPC events.
 */

import { app, BrowserWindow, ipcMain } from 'electron';

let initialized = false;

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  if (initialized) return;
  initialized = true;

  if (!app.isPackaged) {
    // Skip in dev — no metadata published, would just spam errors
    ipcMain.handle('updater:check', async () => ({ skipped: 'dev' }));
    ipcMain.handle('updater:download', async () => ({ skipped: 'dev' }));
    ipcMain.handle('updater:install', async () => ({ skipped: 'dev' }));
    return;
  }

  // Lazy-require so dev doesn't pay the startup cost
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { autoUpdater } = require('electron-updater');

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  const send = (channel: string, payload?: unknown) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  autoUpdater.on('checking-for-update', () => send('updater:checking'));
  autoUpdater.on('update-available', (info: unknown) => send('updater:available', info));
  autoUpdater.on('update-not-available', (info: unknown) => send('updater:not-available', info));
  autoUpdater.on('download-progress', (p: unknown) => send('updater:progress', p));
  autoUpdater.on('update-downloaded', (info: unknown) => send('updater:downloaded', info));
  autoUpdater.on('error', (err: Error) => send('updater:error', { message: err.message }));

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo ?? null;
    } catch (err) {
      return { error: (err as Error).message };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      const path = await autoUpdater.downloadUpdate();
      return { path };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });

  ipcMain.handle('updater:install', async () => {
    autoUpdater.quitAndInstall(false, true);
    return { installing: true };
  });

  // Initial check 5s after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silent — error is forwarded via 'updater:error'
    });
  }, 5000);
}
