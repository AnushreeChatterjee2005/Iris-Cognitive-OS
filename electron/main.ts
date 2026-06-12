import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dashboardWindow: BrowserWindow | null = null;
let searchWindow: BrowserWindow | null = null;
let ignoreBlur = false;

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

app.whenReady().then(() => {
  createDashboardWindow();
  createSearchWindow();

  // Register Ctrl+K global shortcut
  const ret = globalShortcut.register('CommandOrControl+K', () => {
    if (searchWindow) {
      if (searchWindow.isVisible()) {
        searchWindow.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-hidden'))`).catch(console.error);
        setTimeout(() => { searchWindow?.hide(); }, 50);
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
});

ipcMain.on('hide-window', () => {
  if (searchWindow) {
    searchWindow.hide();
  }
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
