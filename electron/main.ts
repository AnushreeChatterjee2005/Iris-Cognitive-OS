import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dashboardWindow: BrowserWindow | null = null;
let searchWindow: BrowserWindow | null = null;

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

  // Register Ctrl+Shift+Space global shortcut
  const ret = globalShortcut.register('CommandOrControl+Shift+Space', () => {
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
  searchWindow?.hide();
});
