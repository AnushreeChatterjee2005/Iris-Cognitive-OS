import { app, BrowserWindow, globalShortcut, ipcMain, screen, session } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ActivityEngine } from './engine/ActivityEngine';
import { ActivityStore } from './store/ActivityStore';
import { EventBus } from './engine/EventBus';
import { authenticatedBackendFetch, readLaunchToken } from './backendClient';
import { BACKEND_URL, DEV_RENDERER_ORIGIN } from './config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dashboardWindow: BrowserWindow | null = null;
let searchWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let blobWindow: BrowserWindow | null = null;
let ignoreBlur = false;
let hasPipelines = false;
let engine: ActivityEngine | null = null;
let store: ActivityStore | null = null;

function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (!app.isPackaged) return url.origin === DEV_RENDERER_ORIGIN;
    if (url.protocol !== 'file:') return false;
    const rendererPath = path.resolve(fileURLToPath(url));
    const distRoot = path.resolve(__dirname, '../dist');
    return rendererPath === distRoot || rendererPath.startsWith(`${distRoot}${path.sep}`);
  } catch {
    return false;
  }
}

function isTrustedSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  return !event.sender.isDestroyed() && isTrustedRendererUrl(event.sender.getURL());
}

function protectWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedRendererUrl(targetUrl)) event.preventDefault();
  });
}

// Suppress AMD GPU DirectComposition errors in terminal
app.disableHardwareAcceleration();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = searchWindow || dashboardWindow;
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
}

function createDashboardWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  dashboardWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    show: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  protectWindow(dashboardWindow);

  // Keep dashboard as a normal 'always-on-top' window
  dashboardWindow.setAlwaysOnTop(true, 'floating');

  if (!app.isPackaged) {
    dashboardWindow.loadURL(`${DEV_RENDERER_ORIGIN}/#/`);
  } else {
    dashboardWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/' });
  }

  // Dashboard is initially closed, so it must ignore all mouse events
  dashboardWindow.setIgnoreMouseEvents(true, { forward: true });

  // Close dashboard when window loses focus (e.g. clicking Windows Start menu, taskbar, or another app)
  dashboardWindow.on('blur', () => {
    if (isDashboardOpen) {
      isDashboardOpen = false;
      dashboardWindow?.setIgnoreMouseEvents(true, { forward: true });
      dashboardWindow?.webContents.send('dashboard-closed');
    }
  });

  // Close dashboard when pressing Escape key
  dashboardWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      if (isDashboardOpen) {
        isDashboardOpen = false;
        dashboardWindow?.setIgnoreMouseEvents(true, { forward: true });
        dashboardWindow?.webContents.send('dashboard-closed');
        event.preventDefault();
      }
    }
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
}

function createBlobWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  blobWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    focusable: false,
    movable: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  protectWindow(blobWindow);

  // Elevate the blob to the absolute highest interactive Z-order level so it's NEVER covered by the dashboard
  blobWindow.setAlwaysOnTop(true, 'pop-up-menu');
  blobWindow.setIgnoreMouseEvents(true, { forward: true });

  if (!app.isPackaged) {
    blobWindow.loadURL(`${DEV_RENDERER_ORIGIN}/#/blob`);
  } else {
    blobWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/blob' });
  }

  blobWindow.on('closed', () => {
    blobWindow = null;
  });
}

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  overlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    movable: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    }
  });

  protectWindow(overlayWindow);
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (!app.isPackaged) {
    overlayWindow.loadURL(`${DEV_RENDERER_ORIGIN}/overlay.html`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../dist/overlay.html'));
  }
}

function createSearchWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  searchWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (!app.isPackaged) {
    searchWindow.loadURL(`${DEV_RENDERER_ORIGIN}/#/search`);
  } else {
    searchWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/search' });
  }

  protectWindow(searchWindow);
  searchWindow.on('blur', () => {
    if (ignoreBlur) return;
    searchWindow?.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-hidden'))`).catch(console.error);
    setTimeout(() => { searchWindow?.hide(); }, 50);
  });

  searchWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      searchWindow?.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-hidden'))`).catch(console.error);
      searchWindow?.hide();
      event.preventDefault();
    }
  });

  searchWindow.on('closed', () => {
    searchWindow = null;
  });
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media' && isTrustedRendererUrl(webContents.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media' && Boolean(webContents) && isTrustedRendererUrl(webContents.getURL());
  });

  createDashboardWindow();
  createSearchWindow();
  createOverlayWindow();
  createBlobWindow();

  try {
    store = new ActivityStore(app.getPath('userData'));
    await store.init();
    
    engine = new ActivityEngine(store);
    await engine.start();

    // Trigger designated startup workspace layout if configured
    setTimeout(async () => {
      try {
        await authenticatedBackendFetch(`${BACKEND_URL}/api/workspaces/startup/trigger`, { method: 'POST' });
      } catch (e) {
        // Backend still initializing or no startup workspace
      }
    }, 2500);
  } catch (e) {
    console.error("[IRIS] Engine failed to start fully:", e);
  }

  EventBus.getInstance().onActivity((event) => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('activity-event', event);
    }
  });

  EventBus.getInstance().on('ui-workflow-update', (workflow) => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('workflow-update', workflow);
    }
  });

  EventBus.getInstance().on('resume-sequence', (data) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (data.type === 'start') {
        overlayWindow.setAlwaysOnTop(true, 'screen-saver');
        overlayWindow.showInactive(); 
      }
      overlayWindow.webContents.send('resume-sequence', data);
      if (data.type === 'complete') {
        setTimeout(() => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.hide();
          }
        }, 2800);
      }
    }
  });

  // Register Ctrl+K global shortcut
  const toggleIrisWindow = () => {
    if (searchWindow) {
      if (searchWindow.isVisible()) {
        searchWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('toggle-chat'))`).catch(console.error);
      } else {
        searchWindow.show();
        searchWindow.focus();
        searchWindow.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-shown'))`).catch(console.error);
        setTimeout(() => {
          searchWindow?.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('toggle-chat'))`).catch(console.error);
        }, 100);
      }
    }
  };

  const ret1 = globalShortcut.register('CommandOrControl+K', toggleIrisWindow);
  const ret2 = globalShortcut.register('CommandOrControl+Shift+K', toggleIrisWindow);
  const ret3 = globalShortcut.register('Alt+Shift+K', toggleIrisWindow);

  if (!ret1 && !ret2 && !ret3) {
    console.log('Global shortcut registration note: Ctrl+K encountered system shortcut conflict.');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDashboardWindow();
      createSearchWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (engine) engine.stop();
  if (store) store.close();
});

ipcMain.handle('get-launch-token', async (event) => {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
  return readLaunchToken();
});

ipcMain.on('hide-window', (event) => {
  if (!isTrustedSender(event)) return;
  if (searchWindow && !hasPipelines) {
    searchWindow.hide();
  }
});

let isDashboardOpen = false;

ipcMain.on('toggle-dashboard', (event, coords) => {
  if (!isTrustedSender(event)) return;
  if (dashboardWindow) {
    if (isDashboardOpen) {
      isDashboardOpen = false;
      dashboardWindow.setIgnoreMouseEvents(true, { forward: true });
      dashboardWindow.webContents.send('dashboard-closed');
      // If we need to release focus, we can just blur it, but CSS pointer-events: none handles clicks
    } else {
      isDashboardOpen = true;
      dashboardWindow.setIgnoreMouseEvents(false);
      dashboardWindow.webContents.send('dashboard-opening', coords);
      dashboardWindow.focus();
    }
  }
});

ipcMain.on('close-dashboard', (event) => {
  if (!isTrustedSender(event)) return;
  if (dashboardWindow && isDashboardOpen) {
    isDashboardOpen = false;
    dashboardWindow.setIgnoreMouseEvents(true, { forward: true });
    dashboardWindow.webContents.send('dashboard-closed');
  }
});

// Removed ready-to-show-dashboard listener since it was redundantly calling focus() and causing OS stutter

ipcMain.on('set-has-pipelines', (event, val) => {
  if (isTrustedSender(event)) hasPipelines = Boolean(val);
});

ipcMain.on('set-click-through', (event, ignore) => {
  if (!isTrustedSender(event)) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('enable-blob-focus', (event) => {
  if (!isTrustedSender(event)) return;
  if (blobWindow) {
    blobWindow.setFocusable(true);
    blobWindow.setIgnoreMouseEvents(false);
    blobWindow.focus();
  }
});

ipcMain.on('disable-blob-focus', (event) => {
  if (!isTrustedSender(event)) return;
  if (blobWindow) {
    blobWindow.setFocusable(false);
    blobWindow.setIgnoreMouseEvents(true, { forward: true });
  }
});

ipcMain.on('set-ignore-blur', (event, ignore) => {
  if (isTrustedSender(event)) ignoreBlur = Boolean(ignore);
});

ipcMain.on('overlay:set-ignore-mouse', (event, ignore: boolean) => {
  if (isTrustedSender(event) && overlayWindow && event.sender === overlayWindow.webContents) {
    overlayWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  }
});

ipcMain.on('overlay:hide', (event) => {
  if (isTrustedSender(event) && overlayWindow && event.sender === overlayWindow.webContents) overlayWindow.hide();
});

import * as fs from 'fs';

ipcMain.handle('read-workspace-files', async (event) => {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
  const dirPath = process.cwd();
  const chunksToEmbed: { filePath: string, text: string }[] = [];
  
  function chunkText(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    for (const line of text.split('\n')) {
      if ((currentChunk + '\n' + line).length > maxLen) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
  }

  function scan(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    for (const file of fs.readdirSync(currentDir)) {
      const fullPath = path.join(currentDir, file);
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'dist-electron') {
            scan(fullPath);
          }
        } else {
          const ext = path.extname(file).toLowerCase();
          if (['.md', '.txt', '.ts', '.tsx', '.json', '.css'].includes(ext)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.trim()) {
              const fileChunks = chunkText(content, 500);
              for (const c of fileChunks) {
                chunksToEmbed.push({ filePath: fullPath, text: c });
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  scan(dirPath);
  return chunksToEmbed;
});

ipcMain.handle('save-semantic-index', async (event, data: unknown) => {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
  if (!Array.isArray(data) || data.length > 50_000) throw new Error('Invalid semantic index payload');
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized, 'utf8') > 25 * 1024 * 1024) throw new Error('Semantic index payload is too large');
  fs.writeFileSync(path.join(app.getPath('userData'), 'iris-semantic-index.json'), serialized, 'utf-8');
  return true;
});

ipcMain.handle('load-semantic-index', async (event) => {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
  const p = path.join(app.getPath('userData'), 'iris-semantic-index.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  return [];
});

ipcMain.handle('search-memory', async (event, query) => {
  if (!isTrustedSender(event) || typeof query !== 'string' || query.length > 2_000) throw new Error('Invalid memory search request');
  if (engine) {
    return await engine.searchMemory(query);
  }
  return [];
});

ipcMain.handle('resume-workflow', async (event, session) => {
  if (!isTrustedSender(event) || !session || typeof session !== 'object') throw new Error('Invalid workflow session');
  if (engine) {
    await engine.resumeWorkflow(session);
  }
});
