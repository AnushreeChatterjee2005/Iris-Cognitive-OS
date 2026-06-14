import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ActivityEngine } from './engine/ActivityEngine';
import { ActivityStore } from './store/ActivityStore';
import { EventBus } from './engine/EventBus';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dashboardWindow: BrowserWindow | null = null;
let searchWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let ignoreBlur = false;
let hasPipelines = false;
let engine: ActivityEngine | null = null;
let store: ActivityStore | null = null;

// Suppress AMD GPU DirectComposition errors in terminal
app.disableHardwareAcceleration();

function createDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (!app.isPackaged) {
    dashboardWindow.loadURL('http://localhost:5173/#/');
  } else {
    dashboardWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/' });
  }

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
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
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (!app.isPackaged) {
    overlayWindow.loadURL('http://localhost:5173/overlay.html');
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
    },
  });

  if (!app.isPackaged) {
    searchWindow.loadURL('http://localhost:5173/#/search');
  } else {
    searchWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/search' });
  }

  searchWindow.on('blur', () => {
    if (ignoreBlur) return;
    searchWindow?.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-hidden'))`).catch(console.error);
    setTimeout(() => { searchWindow?.hide(); }, 50);
  });

  searchWindow.on('closed', () => {
    searchWindow = null;
  });
}

app.whenReady().then(async () => {
  createDashboardWindow();
  createSearchWindow();
  createOverlayWindow();

  try {
    store = new ActivityStore(app.getPath('userData'));
    await store.init();
    
    engine = new ActivityEngine(store);
    await engine.start();
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
        }, 4000);
      }
    }
  });

  // Register Ctrl+K global shortcut
  const ret = globalShortcut.register('CommandOrControl+K', () => {
    if (searchWindow) {
      if (searchWindow.isVisible()) {
        searchWindow.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-hidden'))`).catch(console.error);
        if (!hasPipelines) {
          setTimeout(() => { searchWindow?.hide(); }, 50);
        } else {
          // If pipelines exist, we keep the window visible but make it click-through (handled by React)
        }
      } else {
        searchWindow.show();
        searchWindow.focus();
        searchWindow.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-shown'))`).catch(console.error);
      }
    }
  });

  if (!ret) {
    console.log('registration failed');
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

ipcMain.on('hide-window', () => {
  if (searchWindow && !hasPipelines) {
    searchWindow.hide();
  }
});

ipcMain.on('set-has-pipelines', (event, val) => {
  hasPipelines = val;
});

ipcMain.on('set-click-through', (event, ignore) => {
  if (searchWindow) {
    searchWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('set-ignore-blur', (event, ignore) => {
  ignoreBlur = ignore;
});

import * as fs from 'fs';

ipcMain.handle('read-workspace-files', async () => {
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

ipcMain.handle('save-semantic-index', async (_, data) => {
  fs.writeFileSync(path.join(process.cwd(), '.iris_semantic_index.json'), JSON.stringify(data), 'utf-8');
  return true;
});

ipcMain.handle('load-semantic-index', async () => {
  const p = path.join(process.cwd(), '.iris_semantic_index.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  return [];
});

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
