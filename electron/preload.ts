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
  toggleDashboard: (coords?: {x: number, y: number}) => ipcRenderer.send('toggle-dashboard', coords),
  onBlobSnapped: (callback: (side: 'left' | 'right' | 'none') => void) => ipcRenderer.on('blob-snapped', (event, side) => callback(side)),
  onDashboardOpening: (callback: (coords?: {x: number, y: number}) => void) => ipcRenderer.on('dashboard-opening', (event, coords) => callback(coords)),
  onDashboardClosed: (callback: () => void) => ipcRenderer.on('dashboard-closed', () => callback()),
  closeDashboard: () => ipcRenderer.send('close-dashboard'),
  readyToShowDashboard: () => ipcRenderer.send('ready-to-show-dashboard'),
  enableBlobFocus: () => ipcRenderer.send('enable-blob-focus'),
  disableBlobFocus: () => ipcRenderer.send('disable-blob-focus'),
});
