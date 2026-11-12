/**
 * Preload script — runs in an isolated context with access to a limited set
 * of Node/Electron APIs. Exposes a tiny, safe surface to the renderer so the
 * web app can tell it is running inside the desktop shell, and where the
 * bundled backend is listening (passed by main.cjs as `--campus-api-url=`).
 */

const { contextBridge } = require('electron');

const apiArg = process.argv.find((a) => a.startsWith('--campus-api-url='));

contextBridge.exposeInMainWorld('campusDesktop', {
  isDesktop: true,
  apiUrl: apiArg ? apiArg.slice('--campus-api-url='.length) : null,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
