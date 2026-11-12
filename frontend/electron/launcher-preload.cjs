/**
 * Preload for the launcher window (first-run API key setup, startup progress,
 * and backend errors). Exposes only the handful of actions that page needs.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  onState: (cb) => ipcRenderer.on('launcher:state', (_e, state) => cb(state)),
  saveKey: (key) => ipcRenderer.send('launcher:save-key', key),
  retry: () => ipcRenderer.send('launcher:retry'),
  changeKey: () => ipcRenderer.send('launcher:change-key'),
  openLogs: () => ipcRenderer.send('launcher:open-logs'),
});
