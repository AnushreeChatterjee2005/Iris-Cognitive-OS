import { BrowserWindow, app, globalShortcut, ipcMain, screen } from "electron";
import * as path from "path";
import { fileURLToPath } from "url";
//#region electron/main.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var dashboardWindow = null;
var searchWindow = null;
function createDashboardWindow() {
	dashboardWindow = new BrowserWindow({
		width: 1e3,
		height: 700,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true
		}
	});
	if (!app.isPackaged) dashboardWindow.loadURL("http://localhost:5173/#/");
	else dashboardWindow.loadFile(path.join(__dirname, "../dist/index.html"), { hash: "/" });
	dashboardWindow.on("closed", () => {
		dashboardWindow = null;
	});
}
function createSearchWindow() {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;
	searchWindow = new BrowserWindow({
		width,
		height,
		x: 0,
		y: 0,
		frame: false,
		transparent: true,
		skipTaskbar: true,
		alwaysOnTop: true,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true
		}
	});
	if (!app.isPackaged) searchWindow.loadURL("http://localhost:5173/#/search");
	else searchWindow.loadFile(path.join(__dirname, "../dist/index.html"), { hash: "/search" });
	searchWindow.on("blur", () => {
		searchWindow?.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-hidden'))`).catch(console.error);
		setTimeout(() => {
			searchWindow?.hide();
		}, 50);
	});
	searchWindow.on("closed", () => {
		searchWindow = null;
	});
}
app.whenReady().then(() => {
	createDashboardWindow();
	createSearchWindow();
	if (!globalShortcut.register("CommandOrControl+Shift+Space", () => {
		if (searchWindow) if (searchWindow.isVisible()) {
			searchWindow.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-hidden'))`).catch(console.error);
			setTimeout(() => {
				searchWindow?.hide();
			}, 50);
		} else {
			searchWindow.show();
			searchWindow.focus();
			searchWindow.webContents.executeJavaScript(`window.dispatchEvent(new Event('electron-window-shown'))`).catch(console.error);
		}
	})) console.log("registration failed");
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createDashboardWindow();
			createSearchWindow();
		}
	});
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => {
	globalShortcut.unregisterAll();
});
ipcMain.on("hide-window", () => {
	searchWindow?.hide();
});
//#endregion
export {};
