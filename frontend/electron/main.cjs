/**
 * CampusGPT Desktop — Electron main process.
 *
 * Wraps the Vite/React build in a native window.
 *   • Dev  : loads the Vite dev server (http://localhost:5173) with DevTools.
 *   • Prod : serves the built `dist/` over a custom `app://` protocol so that
 *            React Router (BrowserRouter) keeps working — any unknown path
 *            falls back to index.html, exactly like a web server would.
 *
 * The renderer talks to the Python backend directly at http://127.0.0.1:8000,
 * which the user starts separately. The backend already allows all origins.
 */

const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const isDev = !app.isPackaged && process.env.FORCE_PROD !== '1';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const APP_SCHEME = 'app';

// Register the custom scheme as a privileged, standard, secure scheme.
// Must happen before `app` is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

/** Serve the built SPA from `dist/`, falling back to index.html for routes. */
function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    let relative = decodeURIComponent(pathname).replace(/^\/+/, '');

    // Requests with a file extension map to real files; everything else
    // (client-side routes like /login, /chat) falls back to the SPA shell.
    let target = path.join(DIST_DIR, relative);
    const hasExtension = path.extname(target) !== '';

    // Prevent path traversal outside of dist/.
    if (!target.startsWith(DIST_DIR) || !hasExtension) {
      target = path.join(DIST_DIR, 'index.html');
    }

    try {
      return await net.fetch(pathToFileURL(target).toString());
    } catch {
      return await net.fetch(pathToFileURL(path.join(DIST_DIR, 'index.html')).toString());
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0A0E1F', // matches the app's dark navy theme
    show: false,
    title: 'CampusGPT',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Open http(s) links in the user's default browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[CampusGPT] Failed to load ${url}: ${desc} (${code})`);
  });
  win.webContents.on('did-finish-load', () => {
    console.log('[CampusGPT] Renderer loaded successfully.');
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadURL(`${APP_SCHEME}://bundle/index.html`);
  }
}

app.whenReady().then(() => {
  if (!isDev) {
    registerAppProtocol();
    Menu.setApplicationMenu(null);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
