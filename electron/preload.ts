import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: () => ipcRenderer.send('hide-window'),
  setClickThrough: (ignore: boolean) => ipcRenderer.send('set-click-through', ignore),
  setIgnoreBlur: (ignore: boolean) => ipcRenderer.send('set-ignore-blur', ignore),
  setHasPipelines: (hasPipelines: boolean) => ipcRenderer.send('set-has-pipelines', hasPipelines),
  parseIntent: (text: string) => ipcRenderer.invoke('parse-intent', text),
  readWorkspaceFiles: () => ipcRenderer.invoke('read-workspace-files'),
  saveSemanticIndex: (data: any) => ipcRenderer.invoke('save-semantic-index', data),
  loadSemanticIndex: () => ipcRenderer.invoke('load-semantic-index'),
  onWorkflowUpdate: (callback: (workflow: any) => void) => ipcRenderer.on('workflow-update', (event, workflow) => callback(workflow)),
  onActivityEvent: (callback: (activity: any) => void) => ipcRenderer.on('activity-event', (event, activity) => callback(activity)),
  searchMemory: (query: string) => ipcRenderer.invoke('search-memory', query),
  resumeWorkflow: (session: any) => ipcRenderer.invoke('resume-workflow', session),
});
