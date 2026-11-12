/**
 * CampusGPT Desktop — Electron main process.
 *
 * Wraps the Vite/React build in a native window.
 *   • Dev  : loads the Vite dev server (http://localhost:5173) with DevTools and
 *            talks to the backend you run yourself on http://127.0.0.1:8000.
 *   • Prod : serves the built `dist/` over a custom `app://` protocol so that
 *            React Router (BrowserRouter) keeps working — any unknown path
 *            falls back to index.html, exactly like a web server would.
 *            It also launches the bundled Python backend (PyInstaller build in
 *            resources/backend) on a free port and stops it on quit.
 *
 * User data (chats, uploads, vector store, settings, logs) lives in
 * %APPDATA%\CampusGPT so it survives app updates. The Gemini API key is
 * encrypted with the OS keychain (safeStorage) and passed to the backend via
 * environment variables — it is never written into the install folder.
 */

const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');

const isDev = !app.isPackaged && process.env.FORCE_PROD !== '1';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const APP_SCHEME = 'app';
const DEV_API_URL = 'http://127.0.0.1:8000';

const BACKEND_EXE = app.isPackaged
  ? path.join(process.resourcesPath, 'backend', 'campusgpt-backend.exe')
  : path.join(__dirname, '..', '..', 'backend', 'dist', 'campusgpt-backend', 'campusgpt-backend.exe');

// Pin the data folder to %APPDATA%\CampusGPT. Without this, running unpackaged
// (`electron electron/main.cjs`) would use %APPDATA%\Electron instead.
app.setPath('userData', path.join(app.getPath('appData'), 'CampusGPT'));
const USER_DIR = app.getPath('userData');
const DATA_DIR = path.join(USER_DIR, 'data');
const LOG_DIR = path.join(USER_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'backend.log');
const SETTINGS_FILE = path.join(USER_DIR, 'settings.json');
const BACKEND_START_TIMEOUT_MS = 180_000;

let mainWindow = null;
let launcherWindow = null;
let backend = null;        // ChildProcess of the bundled backend
let backendLogTail = [];   // last lines of backend output, shown on failure
let stoppingBackend = false;

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

// ──────────────────────────────────────────────────────────────
// Settings (API key + JWT secret)
// ──────────────────────────────────────────────────────────────

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.mkdirSync(USER_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getApiKey() {
  const { apiKey } = readSettings();
  if (!apiKey) return null;
  try {
    return apiKey.encrypted
      ? safeStorage.decryptString(Buffer.from(apiKey.value, 'base64'))
      : apiKey.value;
  } catch {
    return null; // keychain changed (e.g. different Windows user) — ask again
  }
}

function setApiKey(key) {
  const settings = readSettings();
  settings.apiKey = safeStorage.isEncryptionAvailable()
    ? { encrypted: true, value: safeStorage.encryptString(key).toString('base64') }
    : { encrypted: false, value: key };
  writeSettings(settings);
}

/** Per-install JWT signing secret, generated once. */
function getJwtSecret() {
  const settings = readSettings();
  if (!settings.jwtSecret) {
    settings.jwtSecret = crypto.randomBytes(48).toString('base64url');
    writeSettings(settings);
  }
  return settings.jwtSecret;
}

// ──────────────────────────────────────────────────────────────
// Bundled backend process
// ──────────────────────────────────────────────────────────────

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = require('net').createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function checkHealth(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/** Start the backend and resolve with its URL once /health answers. */
async function startBackend(apiKey) {
  if (!fs.existsSync(BACKEND_EXE)) {
    throw new Error(`Backend executable not found:\n${BACKEND_EXE}\n\nBuild it with: npm run build:backend`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
  backendLogTail = [];

  const port = await getFreePort();
  stoppingBackend = false;
  backend = spawn(BACKEND_EXE, ['--port', String(port)], {
    cwd: path.dirname(BACKEND_EXE),
    windowsHide: true,
    env: {
      ...process.env,
      GOOGLE_API_KEY: apiKey,
      JWT_SECRET: getJwtSecret(),
      CAMPUSGPT_DATA_DIR: DATA_DIR,
      CHROMA_PERSIST_DIR: path.join(DATA_DIR, 'chroma_store'),
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      ANONYMIZED_TELEMETRY: 'False', // chromadb telemetry off
    },
  });

  const onOutput = (chunk) => {
    logStream.write(chunk);
    backendLogTail.push(...chunk.toString().split(/\r?\n/).filter(Boolean));
    backendLogTail = backendLogTail.slice(-40);
  };
  backend.stdout.on('data', onOutput);
  backend.stderr.on('data', onOutput);

  const proc = backend;
  const exited = new Promise((resolve) => proc.once('exit', (code) => resolve(code)));
  proc.once('exit', (code) => {
    logStream.end();
    if (backend === proc) backend = null;
    // Backend died while the app was in use — tell the user instead of failing silently.
    // Open the launcher before closing the app window so the app doesn't quit.
    if (!stoppingBackend && mainWindow && !mainWindow.isDestroyed()) {
      const win = mainWindow;
      mainWindow = null;
      showLauncherError(`The AI engine stopped unexpectedly (exit code ${code}).`).then(() => win.destroy());
    }
  });

  const deadline = Date.now() + BACKEND_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await Promise.race([
      exited.then((code) => ({ exited: true, code })),
      new Promise((r) => setTimeout(r, 750)).then(() => checkHealth(port)),
    ]);
    if (result && result.exited) {
      const log = backendLogTail.join('\n');
      const err = new Error(
        /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(log)
          ? 'Google rejected your Gemini API key. Please enter a valid key.'
          : `The AI engine failed to start (exit code ${result.code}).`
      );
      err.badKey = /API key not valid|API_KEY_INVALID/i.test(log);
      throw err;
    }
    if (result === true) return `http://127.0.0.1:${port}`;
  }
  await stopBackend();
  throw new Error('The AI engine took too long to start.');
}

function stopBackend() {
  return new Promise((resolve) => {
    if (!backend) return resolve();
    stoppingBackend = true;
    const pid = backend.pid;
    backend.once('exit', () => resolve());
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {});
    } else {
      backend.kill('SIGTERM');
    }
    setTimeout(resolve, 5000); // don't hang quitting
  });
}

// ──────────────────────────────────────────────────────────────
// Windows
// ──────────────────────────────────────────────────────────────

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

/**
 * Retry a failed page load. Chromium's network service occasionally crashes and
 * restarts right at startup, failing the first load with ERR_FAILED; without a
 * retry the window would stay blank (or never appear).
 */
function retryFailedLoads(win, load, label) {
  let attempts = 0;
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ERR_ABORTED: superseded navigation */) return;
    console.error(`[CampusGPT] ${label} failed to load ${url}: ${desc} (${code})`);
    if (attempts++ < 5) {
      setTimeout(() => { if (!win.isDestroyed()) load().catch(() => {}); }, 500 * attempts);
    }
  });
}

function openLinksExternally(win) {
  // Open http(s) links in the user's default browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

let launcherState = null;  // latest state, (re)delivered whenever the page loads
let launcherReady = false;

function ensureLauncher() {
  if (launcherWindow && !launcherWindow.isDestroyed()) return launcherWindow;
  launcherReady = false;
  launcherWindow = new BrowserWindow({
    width: 520,
    height: 520,
    resizable: false,
    maximizable: false,
    backgroundColor: '#0A0E1F',
    show: false,
    title: 'CampusGPT',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'launcher-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  launcherWindow.setMenu(null);
  openLinksExternally(launcherWindow);
  launcherWindow.on('closed', () => {
    launcherWindow = null;
    // Closing the launcher before the app opened means "quit".
    if (!mainWindow) app.quit();
  });
  const win = launcherWindow;
  win.webContents.on('did-finish-load', () => {
    launcherReady = true;
    win.show();
    if (launcherState) win.webContents.send('launcher:state', launcherState);
  });
  const load = () => win.loadFile(path.join(__dirname, 'launcher.html'));
  retryFailedLoads(win, load, 'Launcher');
  load().catch(() => {}); // failures are retried by retryFailedLoads
  return win;
}

/** Show a launcher view; resolves once the page has received it. */
function setLauncherState(state) {
  launcherState = state;
  const win = ensureLauncher();
  if (launcherReady && !win.webContents.isLoading()) {
    win.webContents.send('launcher:state', state);
    return Promise.resolve(win);
  }
  return new Promise((resolve) => win.webContents.once('did-finish-load', () => resolve(win)));
}

function showLauncherError(message) {
  return setLauncherState({ view: 'error', message, log: backendLogTail.slice(-15).join('\n') });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Change Gemini API key…', click: () => promptForKey(true) },
        { label: 'Open data folder', click: () => shell.openPath(USER_DIR) },
        { label: 'View backend log', click: () => shell.openPath(LOG_FILE) },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' }],
    },
  ]);
}

function createMainWindow(apiUrl) {
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
      additionalArguments: [`--campus-api-url=${apiUrl}`],
    },
  });
  mainWindow = win;

  win.once('ready-to-show', () => {
    win.show();
    if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.destroy();
  });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  openLinksExternally(win);

  win.webContents.on('did-finish-load', () => {
    console.log('[CampusGPT] Renderer loaded successfully.');
  });

  const url = isDev ? 'http://localhost:5173' : `${APP_SCHEME}://bundle/index.html`;
  const load = () => win.loadURL(url);
  retryFailedLoads(win, load, 'App window');
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.setMenu(buildMenu());
  }
  load().catch(() => {}); // failures are retried by retryFailedLoads
}

// ──────────────────────────────────────────────────────────────
// Startup flow: (setup key) → start backend → open app
// ──────────────────────────────────────────────────────────────

async function promptForKey(canCancel, hint) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Changing the key from the running app: restart the backend afterwards.
    stoppingBackend = true;
    const win = mainWindow;
    mainWindow = null;
    await setLauncherState({ view: 'setup', canCancel, hint });
    win.destroy();
    await stopBackend();
  } else {
    await setLauncherState({ view: 'setup', canCancel, hint });
  }
}

async function boot() {
  // Unpackaged preview (`npm run electron:preview`) may take the key from the
  // environment so developers don't have to enter it in the launcher.
  const apiKey = getApiKey() || (!app.isPackaged && process.env.GOOGLE_API_KEY) || null;
  if (!apiKey) return promptForKey(false);

  setLauncherState({ view: 'starting' }); // don't block backend start on the page loading
  try {
    const apiUrl = await startBackend(apiKey);
    createMainWindow(apiUrl);
  } catch (err) {
    console.error('[CampusGPT] Backend start failed:', err);
    if (err.badKey) return promptForKey(false, err.message);
    showLauncherError(err.message);
  }
}

ipcMain.on('launcher:save-key', (_e, key) => {
  if (typeof key !== 'string' || !key.trim()) return;
  setApiKey(key.trim());
  boot();
});
ipcMain.on('launcher:retry', () => boot());
ipcMain.on('launcher:change-key', () => promptForKey(Boolean(getApiKey())));
ipcMain.on('launcher:open-logs', () => shell.openPath(LOG_FILE));

// Only one copy of the app (and so one backend) at a time.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = mainWindow || launcherWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    if (isDev) {
      createMainWindow(DEV_API_URL);
    } else {
      registerAppProtocol();
      boot();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) isDev ? createMainWindow(DEV_API_URL) : boot();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting || !backend) return;
  e.preventDefault();
  quitting = true;
  stopBackend().finally(() => app.quit());
});

process.on('exit', () => {
  if (backend) try { backend.kill(); } catch {}
});

// Surface unexpected main-process errors instead of dying silently.
process.on('uncaughtException', (err) => {
  console.error(err);
  dialog.showErrorBox('CampusGPT error', String(err && err.stack || err));
});
