const { contextBridge, ipcRenderer } = require('electron')

// Safe bridge between the React app and the main process
contextBridge.exposeInMainWorld('pgnFile', {
  open: () => ipcRenderer.invoke('open-pgn'),
  save: (contents) => ipcRenderer.invoke('save-pgn', contents),
})

contextBridge.exposeInMainWorld('layoutStore', {
  load: () => ipcRenderer.invoke('load-layout'),
  save: (json) => ipcRenderer.invoke('save-layout', json),
})

contextBridge.exposeInMainWorld('themeStore', {
  load: () => ipcRenderer.invoke('load-user-themes'),
  openDir: () => ipcRenderer.invoke('open-themes-dir'),
})

// Engine profiles are plain JSON persisted in userData; analysis is a stream
// of 'engine-info' / 'engine-error' events keyed by engine id + position.
contextBridge.exposeInMainWorld('engineStore', {
  load: () => ipcRenderer.invoke('load-engines'),
  save: (json) => ipcRenderer.invoke('save-engines', json),
})

contextBridge.exposeInMainWorld('engineHost', {
  openFile: () => ipcRenderer.invoke('engine-open-file'),
  getConfig: (path) => ipcRenderer.invoke('engine-get-config', path),
  analyze: (req) => ipcRenderer.invoke('engine-analyze', req),
  stop: (engineId) => ipcRenderer.invoke('engine-stop', engineId),
  kill: (engineId) => ipcRenderer.invoke('engine-kill', engineId),
  remoteAnalyze: (req) => ipcRenderer.invoke('remote-analyze', req),
  onInfo: (cb) => {
    const handler = (_event, info) => cb(info)
    ipcRenderer.on('engine-info', handler)
    return () => ipcRenderer.removeListener('engine-info', handler)
  },
  onError: (cb) => {
    const handler = (_event, err) => cb(err)
    ipcRenderer.on('engine-error', handler)
    return () => ipcRenderer.removeListener('engine-error', handler)
  },
})

contextBridge.exposeInMainWorld('db', {
  // Local SQLite game databases (see electron/databases.js)
  list: () => ipcRenderer.invoke('db-list'),
  importPgn: () => ipcRenderer.invoke('db-import'),
  searchPosition: (req) => ipcRenderer.invoke('db-search-position', req),
  games: (req) => ipcRenderer.invoke('db-games', req),
  loadGame: (req) => ipcRenderer.invoke('db-load-game', req),
  remove: (req) => ipcRenderer.invoke('db-delete', req),
  // Lichess opening explorer (fetched in the main process)
  explorer: (req) => ipcRenderer.invoke('db-explorer', req),
  // Lichess OAuth sign-in (browser flow; tokens stay in the main process)
  signInLichess: () => ipcRenderer.invoke('db-lichess-signin'),
  lichessSession: () => ipcRenderer.invoke('db-lichess-session'),
  signOutLichess: () => ipcRenderer.invoke('db-lichess-signout'),
  onImportProgress: (cb) => {
    const handler = (_event, progress) => cb(progress)
    ipcRenderer.on('db-import-progress', handler)
    return () => ipcRenderer.removeListener('db-import-progress', handler)
  },
})

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximized: (cb) => {
    const handler = (_event, maximized) => cb(maximized)
    ipcRenderer.on('window-maximized', handler)
    return () => ipcRenderer.removeListener('window-maximized', handler)
  },
})
