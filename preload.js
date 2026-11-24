// Runs sandboxed: only the calls below reach the main process. The page never gets Node or the file system.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('pm', {
  info: () => ipcRenderer.invoke('app:info'),
  wasm: () => ipcRenderer.invoke('sql:wasm'),
  readDb: () => ipcRenderer.invoke('db:read'),
  chooseDb: () => ipcRenderer.invoke('db:choose'),
  setDbPath: (path) => ipcRenderer.invoke('db:set-path', path),
  pathForFile: (file) => webUtils.getPathForFile(file),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openReleases: () => ipcRenderer.invoke('open:releases'),
  smokeReport: (result) => ipcRenderer.invoke('smoke:report', result),
  onDbChanged: (cb) => ipcRenderer.on('db:changed', () => cb()),
  onUpdate: (cb) => ipcRenderer.on('update', (_e, u) => cb(u)),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, m) => cb(m)),
});
