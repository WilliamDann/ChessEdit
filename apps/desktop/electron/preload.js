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
