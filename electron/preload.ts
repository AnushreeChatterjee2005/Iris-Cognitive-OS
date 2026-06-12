import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: () => ipcRenderer.send('hide-window'),
  setClickThrough: (ignore: boolean) => ipcRenderer.send('set-click-through', ignore),
  setIgnoreBlur: (ignore: boolean) => ipcRenderer.send('set-ignore-blur', ignore),
  parseIntent: (text: string) => ipcRenderer.invoke('parse-intent', text),
  readWorkspaceFiles: () => ipcRenderer.invoke('read-workspace-files'),
  saveSemanticIndex: (data: any) => ipcRenderer.invoke('save-semantic-index', data),
  loadSemanticIndex: () => ipcRenderer.invoke('load-semantic-index'),
});
