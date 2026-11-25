const { contextBridge, ipcRenderer } = require('electron')

// Safe bridge between the React app and the main process
contextBridge.exposeInMainWorld('pgnFile', {
  open: () => ipcRenderer.invoke('open-pgn'),
  save: (contents) => ipcRenderer.invoke('save-pgn', contents),
})
