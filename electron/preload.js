const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tracker', {
  runScan: (options) => ipcRenderer.invoke('run-scan', options),
  openLink: (url) => ipcRenderer.invoke('open-link', url),
  openScans: () => ipcRenderer.invoke('open-scans'),
});
