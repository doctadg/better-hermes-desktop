/**
 * Hermes Desktop - Electron Main Process
 *
 * Production-quality main process with:
 * - Frameless window with custom title bar
 * - Window state persistence via JSON file
 * - Single instance lock
 * - Security hardening (CSP, navigation blocking)
 * - Auto-updater stub
 */

import {
  app,
  BrowserWindow,
  screen,
  Tray,
  nativeImage,
  Menu,
  Notification,
  ipcMain,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { registerIPCHandlers } from './ipc-handlers';
import { initUpdater } from './updater';
import { closeDb, getDb } from './db';

// ─── Constants ───
const IS_DEV = !app.isPackaged;
const DEV_SERVER_URL = 'http://localhost:5173';
const PRELOAD_PATH = path.join(__dirname, 'preload.js');
const PROD_INDEX_PATH = path.join(__dirname, '../dist/index.html');

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
const STORE_FILE = 'hermes-desktop.json';

// ─── Globals ───
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// ─── Single instance lock ───
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ─── Persistent JSON store ───
// Using raw JSON file instead of electron-store (ESM-only in v10)
// to keep the main process as plain CommonJS.

function getStorePath(): string {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, STORE_FILE);
}

function loadStoreData(): Record<string, unknown> {
  try {
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      return JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    }
  } catch {
    // Corrupt file — start fresh
  }
  return {};
}

function saveStoreData(data: Record<string, unknown>): void {
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Main] Failed to save store:', err);
  }
}

function storeGet<T = unknown>(key: string): T | undefined {
  const data = loadStoreData();
  return data[key] as T | undefined;
}

function storeSet(key: string, value: unknown): void {
  const data = loadStoreData();
  data[key] = value;
  saveStoreData(data);
}

// ─── Window state persistence ───

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const BOUNDS_KEY = 'window-bounds';

function getDefaultBounds(): WindowBounds {
  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    maximized: false,
  };
}

function loadWindowBounds(): WindowBounds {
  try {
    const saved = storeGet<WindowBounds>(BOUNDS_KEY);
    if (saved && typeof saved === 'object' && saved.width && saved.height) {
      return saved;
    }
  } catch {
    // Fall through to default
  }
  return getDefaultBounds();
}

/**
 * Ensure saved bounds fit on the current screen configuration.
 * Handles cases where the user changes monitor setup between sessions.
 */
function clampBoundsToBounds(bounds: WindowBounds): WindowBounds {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  if (bounds.maximized) {
    return { ...bounds };
  }

  let { x, y, width, height } = bounds;

  width = Math.max(width, MIN_WIDTH);
  height = Math.max(height, MIN_HEIGHT);

  if (x === undefined || y === undefined) {
    x = Math.round((screenWidth - width) / 2);
    y = Math.round((screenHeight - height) / 2);
  } else {
    const allDisplays = screen.getAllDisplays();
    const isVisible = allDisplays.some((display) => {
      const area = display.workArea;
      return (
        x! >= area.x - 100 &&
        x! <= area.x + area.width &&
        y! >= area.y - 100 &&
        y! <= area.y + area.height
      );
    });

    if (!isVisible) {
      x = Math.round((screenWidth - width) / 2);
      y = Math.round((screenHeight - height) / 2);
    }
  }

  return { x, y, width, height, maximized: false };
}

function saveWindowBounds(): void {
  if (!mainWindow) return;
  try {
    const bounds = mainWindow.getBounds();
    storeSet(BOUNDS_KEY, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: mainWindow.isMaximized(),
    });
  } catch (err) {
    console.error('[Main] Failed to save window bounds:', err);
  }
}

// ─── Content Security Policy ───
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self' https: http: ws: wss:",
  "font-src 'self'",
].join('; ');

// ─── System Tray ───

function createTray(): void {
  // Resolve tray icon from build resources (works both dev and packaged)
  const trayIconPath = IS_DEV
    ? path.join(__dirname, '..', 'build', 'tray-icon.png')
    : path.join(process.resourcesPath, 'build', 'tray-icon.png');

  let trayIcon: Electron.NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(trayIconPath);
    // Resize for platform consistency if image is too large
    if (trayIcon.isEmpty()) {
      throw new Error('Tray icon empty');
    }
    if (process.platform === 'darwin') {
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
      trayIcon.setTemplateImage(true); // macOS: template for auto dark/light (mutates in place, returns void)
    } else if (process.platform === 'win32') {
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    }
  } catch {
    // Fallback: create a tiny 16x16 amber pixel icon programmatically
    trayIcon = nativeImage.createFromBuffer(
      Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10, // 16x16
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x91, 0x68, // 8bit RGB
        0x36, 0x00, 0x00, 0x00, 0x01, 0x73, 0x52, 0x47, // sRGB
        0x42, 0x00, 0xAE, 0xCE, 0x1C, 0xE9, 0x00, 0x00, 0x00, 0x04,
        0x67, 0x41, 0x4D, 0x41, 0x00, 0x00, 0xB1, 0x8F, 0x0B, 0xFC,
        0x61, 0x05, 0x00, 0x00, 0x00, 0x20, 0x49, 0x44, 0x41, 0x54,
        0x78, 0x9C, 0x62, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x00, 0x06,
        0x00, 0x03, 0xFA, 0x20, 0x5B, 0xF0, 0x8F, 0xE3, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
      ])
    );
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Hermes Desktop');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        showMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click tray icon to show/restore window
  tray.on('click', () => {
    showMainWindow();
  });

  // Double-click as well
  tray.on('double-click', () => {
    showMainWindow();
  });
}

function showMainWindow(): void {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

// ─── Notifications IPC ───

function registerNotificationHandlers(): void {
  ipcMain.handle('notification:show', async (_event, opts: { title: string; body: string; silent?: boolean }) => {
    if (!Notification.isSupported()) {
      return { success: false, error: 'Notifications not supported' };
    }

    const notification = new Notification({
      title: opts.title,
      body: opts.body,
      silent: opts.silent ?? false,
      icon: nativeImage.createFromPath(
        IS_DEV
          ? path.join(__dirname, '..', 'build', 'icon.png')
          : path.join(process.resourcesPath, 'build', 'icon.png')
      ),
    });

    notification.on('click', () => {
      showMainWindow();
      // Focus the window after a brief delay to ensure it's visible
      setTimeout(() => {
        mainWindow?.focus();
      }, 100);
    });

    notification.show();
    return { success: true };
  });
}

// ─── BrowserWindow creation ───

function createMainWindow(): BrowserWindow {
  const savedBounds = loadWindowBounds();
  const bounds = clampBoundsToBounds(savedBounds);

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,

    // Frameless window — App.tsx handles the custom title bar with .drag-region
    frame: false,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } }
      : {}),

    // Background color matches the app theme (zinc-950) to prevent white flash
    backgroundColor: '#09090b',

    // Don't show until ready to prevent white flash
    show: false,

    // Security
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: !IS_DEV,
    },
  });

  if (bounds.maximized) {
    mainWindow.maximize();
  }

  // ─── Security: Set CSP headers for production ───
  if (!IS_DEV) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [PRODUCTION_CSP],
        },
      });
    });
  }

  // ─── Security: Block navigation to external URLs ───
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = IS_DEV
      ? [DEV_SERVER_URL, 'file://']
      : ['file://'];

    const isAllowed = allowedOrigins.some((origin) => url.startsWith(origin));
    if (!isAllowed) {
      console.warn(`[Main] Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });

  // ─── Load the app ───
  if (IS_DEV) {
    mainWindow.loadURL(DEV_SERVER_URL).then(() => {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  } else {
    mainWindow.loadFile(PROD_INDEX_PATH);
  }

  // ─── Show window when ready ───
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // ─── Window state events (debounced save) ───
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWindowBounds, 300);
  };

  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:state-changed', { maximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:state-changed', { maximized: false });
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
    return false;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // ─── Dev tools toggle shortcut ───
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (
      input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i')
    ) {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  return mainWindow;
}

// ─── App lifecycle ───

app.whenReady().then(() => {
  // Touch the DB once so initial schema runs before any handler call.
  try {
    getDb();
  } catch (err) {
    console.error('[Main] DB init failed:', err);
  }

  registerIPCHandlers(storeGet, storeSet);
  createMainWindow();
  createTray();
  registerNotificationHandlers();
  initUpdater(() => mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  saveWindowBounds();
  try {
    closeDb();
  } catch {
    // Best-effort
  }
});

// Security: prevent new window/popup creation
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
