import { contextBridge, ipcRenderer } from 'electron';

function invokeWithTimeout<T>(channel: string, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`IPC request '${channel}' timed out`)), 15_000);
    void (ipcRenderer.invoke(channel, ...args) as Promise<T>).then(resolve, reject).finally(() => clearTimeout(timeoutId));
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  getLaunchToken: () => invokeWithTimeout<string>('get-launch-token'),
  hideWindow: () => ipcRenderer.send('hide-window'),
  setClickThrough: (ignore: boolean) => ipcRenderer.send('set-click-through', ignore),
  setIgnoreBlur: (ignore: boolean) => ipcRenderer.send('set-ignore-blur', ignore),
  setHasPipelines: (hasPipelines: boolean) => ipcRenderer.send('set-has-pipelines', hasPipelines),
  readWorkspaceFiles: () => invokeWithTimeout('read-workspace-files'),
  saveSemanticIndex: (data: unknown) => invokeWithTimeout('save-semantic-index', data),
  loadSemanticIndex: () => invokeWithTimeout('load-semantic-index'),
  onWorkflowUpdate: (callback: (workflow: unknown) => void) => ipcRenderer.on('workflow-update', (_event, workflow) => callback(workflow)),
  onActivityEvent: (callback: (activity: unknown) => void) => ipcRenderer.on('activity-event', (_event, activity) => callback(activity)),
  searchMemory: (query: string) => invokeWithTimeout('search-memory', query),
  resumeWorkflow: (session: unknown) => invokeWithTimeout('resume-workflow', session),
  toggleDashboard: (coords?: {x: number, y: number}) => ipcRenderer.send('toggle-dashboard', coords),
  onBlobSnapped: (callback: (side: 'left' | 'right' | 'none') => void) => ipcRenderer.on('blob-snapped', (event, side) => callback(side)),
  onDashboardOpening: (callback: (coords?: {x: number, y: number}) => void) => ipcRenderer.on('dashboard-opening', (event, coords) => callback(coords)),
  onDashboardClosed: (callback: () => void) => ipcRenderer.on('dashboard-closed', () => callback()),
  closeDashboard: () => ipcRenderer.send('close-dashboard'),
  readyToShowDashboard: () => ipcRenderer.send('ready-to-show-dashboard'),
  enableBlobFocus: () => ipcRenderer.send('enable-blob-focus'),
  disableBlobFocus: () => ipcRenderer.send('disable-blob-focus'),
  overlaySetIgnoreMouse: (ignore: boolean) => ipcRenderer.send('overlay:set-ignore-mouse', ignore),
  overlayHide: () => ipcRenderer.send('overlay:hide'),
  onOverlayToggle: (callback: () => void) => ipcRenderer.on('toggle-overlay', () => callback()),
  onResumeSequence: (callback: (data: unknown) => void) => ipcRenderer.on('resume-sequence', (_event, data) => callback(data)),
});
