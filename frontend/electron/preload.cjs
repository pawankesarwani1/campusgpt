/**
 * Preload script — runs in an isolated context with access to a limited set
 * of Node/Electron APIs. Exposes a tiny, safe surface to the renderer so the
 * web app can tell it is running inside the desktop shell if it ever needs to.
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('campusDesktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
