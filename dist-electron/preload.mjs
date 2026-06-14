let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	hideWindow: () => electron.ipcRenderer.send("hide-window"),
	setClickThrough: (ignore) => electron.ipcRenderer.send("set-click-through", ignore),
	setIgnoreBlur: (ignore) => electron.ipcRenderer.send("set-ignore-blur", ignore),
	setHasPipelines: (hasPipelines) => electron.ipcRenderer.send("set-has-pipelines", hasPipelines),
	parseIntent: (text) => electron.ipcRenderer.invoke("parse-intent", text),
	readWorkspaceFiles: () => electron.ipcRenderer.invoke("read-workspace-files"),
	saveSemanticIndex: (data) => electron.ipcRenderer.invoke("save-semantic-index", data),
	loadSemanticIndex: () => electron.ipcRenderer.invoke("load-semantic-index"),
	onWorkflowUpdate: (callback) => electron.ipcRenderer.on("workflow-update", (event, workflow) => callback(workflow)),
	onActivityEvent: (callback) => electron.ipcRenderer.on("activity-event", (event, activity) => callback(activity)),
	searchMemory: (query) => electron.ipcRenderer.invoke("search-memory", query),
	resumeWorkflow: (session) => electron.ipcRenderer.invoke("resume-workflow", session)
});
//#endregion
