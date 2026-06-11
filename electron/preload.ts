import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: () => ipcRenderer.send('hide-window'),
  parseIntent: (text: string) => ipcRenderer.invoke('parse-intent', text),
});
