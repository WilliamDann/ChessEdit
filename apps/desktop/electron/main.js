const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs/promises')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// Open a .pgn file via native dialog, return { filePath, contents }
ipcMain.handle('open-pgn', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'PGN', extensions: ['pgn'] }],
    properties: ['openFile'],
  })
  if (result.canceled) return null
  const filePath = result.filePaths[0]
  const contents = await fs.readFile(filePath, 'utf-8')
  return { filePath, contents }
})

// Save text to a .pgn file via native dialog, return the path
ipcMain.handle('save-pgn', async (_event, contents) => {
  const result = await dialog.showSaveDialog({
    filters: [{ name: 'PGN', extensions: ['pgn'] }],
    defaultPath: 'game.pgn',
  })
  if (result.canceled || !result.filePath) return null
  await fs.writeFile(result.filePath, contents, 'utf-8')
  return result.filePath
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
