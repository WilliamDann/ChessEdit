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
