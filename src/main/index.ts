import { app, BrowserWindow, ipcMain, globalShortcut, screen } from 'electron';
import path from 'path';
import { ActivityEngine } from './engine/ActivityEngine';
import { ActivityStore } from './store/ActivityStore';
import { EventBus } from './engine/EventBus';

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let anchorWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let engine: ActivityEngine | null = null;
let store: ActivityStore | null = null;

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: "IRIS | Activity Stream",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const htmlPath = getHtmlPath('index.html');
  mainWindow.loadFile(htmlPath);
}

async function createOverlayWindow() {
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
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  const htmlPath = getHtmlPath('overlay.html');
  overlayWindow.loadFile(htmlPath);
}

async function createAnchorWindow() {
  anchorWindow = new BrowserWindow({
    width: 650,
    height: 200,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const htmlPath = getHtmlPath('anchor.html');
  anchorWindow.loadFile(htmlPath);

  anchorWindow.on('blur', () => {
    anchorWindow?.hide();
  });
}

async function createWidgetWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  widgetWindow = new BrowserWindow({
    width: 64,
    height: 64,
    x: width - 80,
    y: height - 80,
    show: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const htmlPath = getHtmlPath('widget.html');
  widgetWindow.loadFile(htmlPath);
}

function getHtmlPath(filename: string): string {
  if (!app.isPackaged) {
    const srcPath = path.join(app.getAppPath(), 'src/renderer', filename);
    if (require('fs').existsSync(srcPath)) return srcPath;
  }
  return path.join(__dirname, '../renderer', filename);
}

function toggleOverlay() {
  if (!overlayWindow) return;
  overlayWindow.webContents.send('toggle-overlay');
}

app.whenReady().then(async () => {
  console.log("[IRIS] Starting Cognitive Command Layer...");
  
  try {
    store = new ActivityStore(app.getPath('userData'));
    await store.init();
    
    engine = new ActivityEngine(store);
    await engine.start();
  } catch (e) {
    console.error("[IRIS] Engine failed to start fully:", e);
  }

  // Always create windows
  await createMainWindow();
  await createOverlayWindow();
  await createAnchorWindow();
  await createWidgetWindow();

  // Register Global Hotkeys
  globalShortcut.register('CommandOrControl+K', toggleOverlay);
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    if (anchorWindow) {
      anchorWindow.show();
      anchorWindow.webContents.send('focus-anchor');
    }
  });

  // IPC Handlers
  ipcMain.on('show-overlay-window', () => {
    if (overlayWindow) {
      overlayWindow.show();
      overlayWindow.focus();
    }
  });

  ipcMain.on('hide-overlay-window', () => {
    if (overlayWindow) overlayWindow.hide();
  });

  ipcMain.on('hide-anchor-window', () => {
    if (anchorWindow) anchorWindow.hide();
  });

  ipcMain.on('toggle-main-window', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  ipcMain.on('set-intent-anchor', (event, intentStr) => {
    console.log(`[IRIS] User set intent anchor: "${intentStr}"`);
    // Pass this down to the engine/EventBus so it can bias the active session
    if (engine) {
      // Create a semantic anchor event
      const anchorEvent = {
        id: require('uuid').v4(),
        type: 'user.intent_anchor' as const,
        source: 'user' as const,
        timestamp: Date.now(),
        sessionId: engine.getSessionId(),
        payload: { intent: intentStr }
      };
      EventBus.getInstance().publish(anchorEvent);
    }
  });

  ipcMain.on('set-ignore-mouse', (event, ignore) => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

  // Relay events
  EventBus.getInstance().onActivity((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('activity-event', event);
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('activity-event', event);
    }
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('activity-event', event);
    }
  });

  EventBus.getInstance().on('ui-workflow-update', (workflow) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('workflow-update', workflow);
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('workflow-update', workflow);
    }
  });

  EventBus.getInstance().on('resume-sequence', (data) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (data.type === 'start') {
        overlayWindow.setAlwaysOnTop(true, 'screen-saver');
        overlayWindow.showInactive(); // Show without stealing focus from VS Code
      }
      overlayWindow.webContents.send('resume-sequence', data);
      if (data.type === 'complete') {
        setTimeout(() => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.hide();
          }
        }, 4000);
      }
    }
  });

  // IPC for overlay actions
  ipcMain.handle('search-memory', async (event, query) => {
    if (engine) {
      return await engine.searchMemory(query);
    }
    return [];
  });

  ipcMain.handle('resume-workflow', async (event, session) => {
    if (engine) {
      await engine.resumeWorkflow(session);
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (engine) engine.stop();
  if (store) store.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
