let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	hideWindow: () => electron.ipcRenderer.send("hide-window"),
	parseIntent: (text) => electron.ipcRenderer.invoke("parse-intent", text)
});
//#endregion
