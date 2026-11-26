const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const engines = require('./engines')

// userData lives at ~/.config/ChessEdit (themes, saved layouts)
app.setName('ChessEdit')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    frame: false,
    transparent: true,
    // Transparent base so the page can show the desktop through it
    // (also avoids a white flash before the renderer paints)
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // No native menu bar — the app draws its own title bar. Devtools are
  // auto-opened in dev below, and Ctrl+R is wired manually for dev reloads.
  Menu.setApplicationMenu(null)

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Markdown links in comments open in the system browser, never navigate the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Report maximize state so the title bar button can swap icons
  for (const ev of ['maximize', 'unmaximize']) {
    win.on(ev, () => win.webContents.send('window-maximized', win.isMaximized()))
  }

  // Dev-only reload shortcut (menu accelerators are gone with the menu)
  if (process.env.VITE_DEV_SERVER_URL) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.key.toLowerCase() === 'r') {
        win.webContents.reload()
        event.preventDefault()
      }
    })
  }
}

// Open a .pgn file via native dialog, return { filePath, contents }
ipcMain.handle('open-pgn', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, {
    filters: [{ name: 'PGN', extensions: ['pgn'] }],
    properties: ['openFile'],
  })
  if (result.canceled) return null
  const filePath = result.filePaths[0]
  const contents = await fs.readFile(filePath, 'utf-8')
  return { filePath, contents }
})

// Save text to a .pgn file via native dialog, return the path
ipcMain.handle('save-pgn', async (event, contents) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showSaveDialog(win, {
    filters: [{ name: 'PGN', extensions: ['pgn'] }],
    defaultPath: 'game.pgn',
  })
  if (result.canceled || !result.filePath) return null
  await fs.writeFile(result.filePath, contents, 'utf-8')
  return result.filePath
})

// Persist the dock layout as JSON in userData
const layoutPath = () => path.join(app.getPath('userData'), 'layout.json')

ipcMain.handle('load-layout', async () => {
  try {
    return await fs.readFile(layoutPath(), 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('save-layout', async (_event, json) => {
  await fs.writeFile(layoutPath(), json, 'utf-8')
})

// ── Engine profiles (userData/engines.json) ────────────────────────────────

const enginesPath = () => path.join(app.getPath('userData'), 'engines.json')

ipcMain.handle('load-engines', async () => {
  try {
    return await fs.readFile(enginesPath(), 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('save-engines', async (_event, json) => {
  await fs.writeFile(enginesPath(), json, 'utf-8')
})

// Engine processes: UCI handshake, analysis, info streaming (see engines.js)
engines.register(ipcMain, () => BrowserWindow.getAllWindows()[0] ?? null)

// Custom title bar window controls
ipcMain.on('window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

// ── User themes (userData/themes/*.json) ────────────────────────────────

const themesDir = () => path.join(app.getPath('userData'), 'themes')

const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

function isValidTheme(p) {
  return (
    p && typeof p === 'object' &&
    typeof p.label === 'string' && p.label.length > 0 &&
    isHex(p.bg) && isHex(p.fg) && isHex(p.accent) &&
    (p.red === undefined || isHex(p.red)) &&
    (p.green === undefined || isHex(p.green)) &&
    (p.yellow === undefined || isHex(p.yellow)) &&
    (p.cyan === undefined || isHex(p.cyan))
  )
}

ipcMain.handle('load-user-themes', async () => {
  try {
    const files = (await fs.readdir(themesDir())).filter((f) => f.endsWith('.json'))
    const themes = []
    for (const file of files) {
      try {
        const palette = JSON.parse(await fs.readFile(path.join(themesDir(), file), 'utf-8'))
        if (isValidTheme(palette)) {
          // id = filename, so my-theme.json overrides a built-in of the same id
          themes.push({ id: file.replace(/\.json$/, ''), palette })
        } else {
          console.warn(`Ignoring invalid theme file: ${file}`)
        }
      } catch (err) {
        console.warn(`Failed to read theme file ${file}:`, err)
      }
    }
    return themes
  } catch {
    return [] // no themes dir yet
  }
})

ipcMain.handle('open-themes-dir', async () => {
  const dir = themesDir()
  await fs.mkdir(dir, { recursive: true })
  const example = path.join(dir, 'example.json')
  try {
    await fs.access(example)
  } catch {
    // Seed a copyable example (Tokyo Night) for first-time users
    await fs.writeFile(
      example,
      JSON.stringify(
        {
          label: 'My Theme (edit me)',
          bg: '#1a1b26',
          fg: '#a9b1d6',
          accent: '#7aa2f7',
          red: '#f7768e',
          green: '#9ece6a',
          yellow: '#e0af68',
          cyan: '#449dab',
        },
        null,
        2,
      ),
    )
  }
  shell.openPath(dir)
})

ipcMain.on('window-toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
})

ipcMain.on('window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('window-is-maximized', (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
})

app.whenReady().then(createWindow)

app.on('before-quit', () => {
  engines.killAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
