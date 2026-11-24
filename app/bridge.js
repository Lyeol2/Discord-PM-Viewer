/* One interface over the two places the viewer runs:
 * - the desktop app (window.pm from preload.js): reads bot.db from disk and reloads when the file changes
 * - a plain browser (for development): pick or drop a file, or ?db=<url>
 */
(function () {
  'use strict';
  const pm = window.pm;
  const listeners = { change: [], update: [], menu: [] };
  const emit = (kind, value) => listeners[kind].forEach((cb) => cb(value));

  function readLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* private mode */ }
  }

  let browserDb = null; // { name, bytes, at }

  function pickFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.db,.sqlite,.sqlite3,application/x-sqlite3,application/octet-stream';
      input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }

  async function useFile(file) {
    browserDb = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), at: new Date() };
    emit('change');
    return file.name;
  }

  const Bridge = {
    desktop: !!pm,

    async info() {
      if (pm) return pm.info();
      return { version: 'web', platform: 'browser', dbPath: browserDb ? browserDb.name : null, smoke: false };
    },

    async initSql() {
      if (pm) {
        const wasmBinary = await pm.wasm();
        return window.initSqlJs({ wasmBinary });
      }
      return window.initSqlJs({ locateFile: (file) => `vendor/${file}` });
    },

    /** -> { path, bytes, mtime } | { path, error } | null when no file is chosen yet */
    async readDb() {
      if (pm) return pm.readDb();
      if (!browserDb) {
        const url = new URLSearchParams(location.search).get('db');
        if (url) {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) return { path: url, error: `HTTP ${res.status}` };
          browserDb = { name: url, bytes: new Uint8Array(await res.arrayBuffer()), at: new Date() };
        }
      }
      return browserDb ? { path: browserDb.name, bytes: browserDb.bytes, mtime: browserDb.at.getTime() } : null;
    },

    async chooseDb() {
      if (pm) return pm.chooseDb();
      const file = await pickFile();
      return file ? useFile(file) : null;
    },

    async dropFile(file) {
      if (pm) return pm.setDbPath(pm.pathForFile(file));
      return useFile(file);
    },

    async getSettings() {
      if (pm) return pm.getSettings();
      return readLocal('pm-viewer-settings', {});
    },
    async saveSettings(patch) {
      if (pm) return pm.saveSettings(patch);
      writeLocal('pm-viewer-settings', Object.assign(readLocal('pm-viewer-settings', {}), patch));
    },

    onChange(cb) { listeners.change.push(cb); },
    onUpdate(cb) { listeners.update.push(cb); },
    onMenu(cb) { listeners.menu.push(cb); },

    checkUpdate() { return pm ? pm.checkUpdate() : null; },
    installUpdate() { return pm && pm.installUpdate(); },
    openReleases() {
      if (pm) return pm.openReleases();
      window.open('https://github.com/Lyeol2/Discord-PM-Viewer/releases/latest', '_blank', 'noopener');
    },
    smokeReport(result) { return pm && pm.smokeReport(result); },
  };

  if (pm) {
    pm.onDbChanged(() => emit('change'));
    pm.onUpdate((u) => emit('update', u));
    pm.onMenu((m) => emit('menu', m));
  }

  window.Bridge = Bridge;
})();
