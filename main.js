// Electron main process: owns the window, reads bot.db from disk, watches it for changes and runs auto-update.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RELEASES_URL = 'https://github.com/Lyeol2/Discord-PM-Viewer/releases/latest';
const UPDATE_EVERY_MS = 4 * 60 * 60 * 1000;

// `electron . --smoke-test=sample/sample.db`: open the file, render every view, print the result, exit (CI).
const smokeArg = process.argv.find((a) => a.startsWith('--smoke-test='));
const SMOKE = smokeArg ? path.resolve(smokeArg.slice('--smoke-test='.length)) : null;
if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pm-viewer-smoke-')));

let win = null;
let settings = {};
let watched = null;

/* ---- settings (userData/settings.json) ----------------------------------- */

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {};
  } catch (_) {
    settings = {};
  }
  if (SMOKE) settings = { dbPath: SMOKE };
}

function saveSettings() {
  if (SMOKE) return;
  const file = settingsFile();
  const tmp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error('settings not saved:', e.message);
  }
}

/* ---- the database file ------------------------------------------------------ */

function send(channel, value) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, value);
}

function watch(file) {
  if (watched) fs.unwatchFile(watched);
  watched = file || null;
  if (!watched) return;
  // Polling, not fs.watch: it survives the file being replaced and works the same on every OS.
  fs.watchFile(watched, { interval: 2000 }, (cur, prev) => {
    if (cur.mtimeMs !== prev.mtimeMs || cur.size !== prev.size) send('db:changed');
  });
}

function useDb(file) {
  settings.dbPath = file;
  saveSettings();
  watch(file);
  return file;
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (_) {
    return false;
  }
}

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  dbPath: settings.dbPath || null,
  smoke: !!SMOKE,
}));

ipcMain.handle('sql:wasm', () => fs.promises.readFile(path.join(__dirname, 'app', 'vendor', 'sql-wasm.wasm')));

ipcMain.handle('db:read', async () => {
  const file = settings.dbPath;
  if (!file) return null;
  try {
    const [bytes, stat] = await Promise.all([fs.promises.readFile(file), fs.promises.stat(file)]);
    return { path: file, bytes, mtime: stat.mtimeMs };
  } catch (e) {
    return { path: file, error: e.code === 'ENOENT' ? '파일이 없어요. 옮겨졌거나 지워졌을 수 있어요.' : e.message };
  }
});

ipcMain.handle('db:choose', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'PM 봇 DB 파일 열기 (data/bot.db)',
    defaultPath: settings.dbPath ? path.dirname(settings.dbPath) : undefined,
    properties: ['openFile'],
    filters: [{ name: 'SQLite DB', extensions: ['db', 'sqlite', 'sqlite3'] }, { name: '모든 파일', extensions: ['*'] }],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return useDb(res.filePaths[0]);
});

ipcMain.handle('db:set-path', (_e, file) => (typeof file === 'string' && isFile(file) ? useDb(file) : null));

ipcMain.handle('settings:get', () => settings.ui || {});
ipcMain.handle('settings:save', (_e, patch) => {
  if (patch && typeof patch === 'object') {
    settings.ui = Object.assign({}, settings.ui, patch);
    saveSettings();
  }
});

ipcMain.handle('open:releases', () => shell.openExternal(RELEASES_URL));

/* ---- auto-update -------------------------------------------------------------- */

let updater = null;

function setupUpdates() {
  if (!app.isPackaged || SMOKE) return;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch (e) {
    console.error('electron-updater unavailable:', e.message);
    return;
  }
  // Without a paid Apple certificate the mac build can't replace itself, so there we only announce new versions.
  const manual = process.platform === 'darwin';
  updater.autoDownload = !manual;
  updater.autoInstallOnAppQuit = !manual;
  updater.on('checking-for-update', () => send('update', { state: 'checking' }));
  updater.on('update-not-available', () => send('update', { state: 'none' }));
  updater.on('update-available', (info) => send('update', { state: 'available', version: info.version, manual }));
  updater.on('download-progress', (p) => send('update', { state: 'progress', percent: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', (info) => send('update', { state: 'ready', version: info.version }));
  updater.on('error', (e) => send('update', { state: 'error', message: e ? e.message : '' }));
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 5000);
  setInterval(check, UPDATE_EVERY_MS);
}

ipcMain.handle('update:check', async () => {
  if (!updater) {
    send('update', { state: 'error', message: app.isPackaged ? '업데이트 모듈을 불러오지 못했어요.' : '개발 실행에서는 업데이트를 확인하지 않아요.' });
    return;
  }
  try {
    await updater.checkForUpdates();
  } catch (e) {
    send('update', { state: 'error', message: e.message });
  }
});
ipcMain.handle('update:install', () => updater && updater.quitAndInstall());

/* ---- smoke test ------------------------------------------------------------------ */

const smokeErrors = [];
ipcMain.handle('smoke:report', (_e, result) => {
  if (!SMOKE) return;
  const ok = !!(result && result.ok) && smokeErrors.length === 0;
  console.log(`SMOKE ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify({ ...result, consoleErrors: smokeErrors })}`);
  setTimeout(() => app.exit(ok ? 0 : 1), 100);
});

/* ---- window ---------------------------------------------------------------------- */

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '파일',
      submenu: [
        { label: 'bot.db 열기…', accelerator: 'CmdOrCtrl+O', click: () => send('menu', 'open') },
        { label: '다시 읽기', accelerator: 'CmdOrCtrl+R', click: () => send('menu', 'reload') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: '보기',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' }, { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    { label: '도움말', submenu: [{ label: '릴리즈 노트', click: () => shell.openExternal(RELEASES_URL) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: 'PM Viewer',
    backgroundColor: '#f4f4f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links (Discord threads, Notion pages, release notes) open in the user's browser; the window never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });

  if (SMOKE) {
    win.webContents.on('console-message', (e, level, message) => {
      const lvl = e && e.level !== undefined ? e.level : level;
      const msg = e && e.message !== undefined ? e.message : message;
      if (lvl === 'error' || lvl === 3) smokeErrors.push(String(msg));
    });
    win.webContents.on('render-process-gone', (_e, d) => {
      console.log(`SMOKE FAIL renderer gone: ${d.reason}`);
      app.exit(1);
    });
    setTimeout(() => {
      console.log('SMOKE FAIL timeout');
      app.exit(1);
    }, 60000);
  } else {
    win.once('ready-to-show', () => win.show());
  }

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.on('closed', () => { win = null; });
}

if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    loadSettings();
    if (settings.dbPath) watch(settings.dbPath);
    buildMenu();
    createWindow();
    setupUpdates();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || SMOKE) app.quit();
  });
}
