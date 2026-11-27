// Local chess databases (SQLite) and the Lichess opening explorer.
//
// Modeled on en-croissant's src-tauri/src/db: a database is one file in
// userData/databases holding a `games` table (PGN tag columns + moves as
// space-separated UCI) plus a `positions` index — one row per position of
// every game, keyed by FEN piece placement + side to move. Opening
// statistics ("what was played from here, with what results?") are then a
// single GROUP BY over that index, which is what our DuckDB-extension-less
// setup gives up for the simplicity of SQLite in Electron.
//
// PGN parsing uses chessops, which is ESM-only (its CJS build is broken),
// so it loads through dynamic import — fine from the Electron main process.

const path = require('path')
const fs = require('fs/promises')
const fsSync = require('fs')
const { app, dialog, BrowserWindow } = require('electron')
const Database = require('better-sqlite3')
const lichessAuth = require('./lichess-auth')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT,
  site TEXT,
  date TEXT,
  white TEXT,
  black TEXT,
  white_elo INTEGER,
  black_elo INTEGER,
  result TEXT,
  ply_count INTEGER,
  fen TEXT,
  moves TEXT
);
CREATE TABLE IF NOT EXISTS positions (
  fen TEXT NOT NULL,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply INTEGER NOT NULL,
  move TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_positions_fen ON positions(fen);
CREATE INDEX IF NOT EXISTS idx_games_white ON games(white);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black);
`

const IMPORT_BATCH = 500
const OPENINGS_LIMIT = 60
const GAMES_PAGE_MAX = 100

// ── chessops (lazy ESM singleton) ───────────────────────────────────────────

let chessops = null
async function loadChessops() {
  if (!chessops) {
    const [pgn, chess, san, fen, util] = await Promise.all([
      import('chessops/pgn'),
      import('chessops/chess'),
      import('chessops/san'),
      import('chessops/fen'),
      import('chessops'),
    ])
    chessops = { pgn, chess, san, fen, makeUci: util.makeUci }
  }
  return chessops
}

// Index key: piece placement + side to move (no castling rights, en-passant
// or clocks), so transposed setups count together — the convention the
// Lichess opening explorer uses too.
function positionKey(fen, position) {
  return fen.makeFen(position.toSetup()).split(' ').slice(0, 2).join(' ')
}

// ── Database files ──────────────────────────────────────────────────────────

function databasesDir() {
  return path.join(app.getPath('userData'), 'databases')
}

function dbPath(name) {
  const safe =
    String(name)
      .replace(/[/\\:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'database'
  return path.join(databasesDir(), `${safe}.sqlite`)
}

const openDatabases = new Map() // name -> better-sqlite3 Database

function openDatabase(name) {
  let db = openDatabases.get(name)
  if (db) return db
  fsSync.mkdirSync(databasesDir(), { recursive: true })
  db = new Database(dbPath(name))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  openDatabases.set(name, db)
  return db
}

function closeAll() {
  for (const db of openDatabases.values()) db.close()
  openDatabases.clear()
  countCache.clear()
}

const countCache = new Map() // name -> game count, invalidated on import/delete

function getMeta(db, key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null
}

// ── PGN import ──────────────────────────────────────────────────────────────

function defaultDbName(pgnPath) {
  return path.basename(pgnPath).replace(/\.pgn$/i, '') || 'imported'
}

// PGN games are separated by a blank line before the next tag section.
// Splitting on that boundary lets us parse in batches so memory stays
// bounded and progress events flow while a large file is importing.
function* gameBatches(text, size) {
  const parts = text
    .split(/\r?\n\s*\r?\n(?=\[)/)
    .map((s) => s.trim())
    .filter(Boolean)
  let batch = []
  for (const part of parts) {
    batch.push(part)
    if (batch.length >= size) {
      yield batch
      batch = []
    }
  }
  if (batch.length) yield batch
}

function parseBatch(batch) {
  const { pgn } = chessops
  let games = []
  try {
    games = pgn.parsePgn(batch.join('\n\n'))
    return { games, failed: 0 }
  } catch {
    // One malformed game makes the whole batch throw — fall back to
    // game-at-a-time parsing and keep the good ones.
  }
  let failed = 0
  for (const part of batch) {
    try {
      games.push(...pgn.parsePgn(part))
    } catch {
      failed++
    }
  }
  return { games, failed }
}

function insertGames(db, games) {
  const { pgn, chess, san, fen } = chessops
  const insertGame = db.prepare(
    `INSERT INTO games (event, site, date, white, black, white_elo, black_elo, result, ply_count, fen, moves)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertPosition = db.prepare(
    'INSERT INTO positions (fen, game_id, ply, move) VALUES (?, ?, ?, ?)',
  )

  let inserted = 0
  let bad = 0

  const run = db.transaction((games) => {
    for (const game of games) {
      let position
      try {
        position = pgn.startingPosition(game.headers).unwrap()
      } catch {
        bad++ // unparseable FEN header
        continue
      }
      if (!(position instanceof chess.Chess)) {
        bad++ // variant positions are out of scope for the index
        continue
      }

      const header = (key) => game.headers.get(key) ?? null
      const elo = (key) => {
        const v = Number.parseInt(header(key) ?? '', 10)
        return Number.isFinite(v) ? v : null
      }

      // Walk the main line; variations are not indexed (databases store one
      // line per game, like every chess database format).
      const ucis = []
      const rows = [] // [positionKey, uci, ply]
      const seen = new Set()
      let node = game.moves
      let ply = 0
      while (node.children.length > 0) {
        const child = node.children[0]
        const moveSan = child.data?.san
        if (!moveSan) break
        const move = san.parseSan(position, moveSan)
        if (!move) break // illegal move — keep the valid prefix
        const key = positionKey(fen, position)
        position.play(move)
        const uci = chessops.makeUci(move)
        // One row per (position, game): the first occurrence wins, so a
        // threefold repetition never double-counts a game in the stats.
        if (!seen.has(key)) {
          seen.add(key)
          rows.push([key, uci, ply])
        }
        ucis.push(uci)
        ply++
        node = child
      }
      if (ucis.length === 0) {
        bad++ // header-only game
        continue
      }

      const info = insertGame.run(
        header('Event'),
        header('Site'),
        header('UTCDate') ?? header('Date'),
        header('White') ?? '?',
        header('Black') ?? '?',
        elo('WhiteElo'),
        elo('BlackElo'),
        header('Result') ?? '*',
        ucis.length,
        header('FEN'),
        ucis.join(' '),
      )
      const id = Number(info.lastInsertRowid)
      for (const [key, uci, ply] of rows) insertPosition.run(key, id, ply, uci)
      inserted++
    }
  })
  run(games)
  return { inserted, bad }
}

async function importPgnFile(pgnPath, onProgress) {
  await loadChessops()
  const text = await fs.readFile(pgnPath, 'utf8')
  const name = defaultDbName(pgnPath)
  const db = openDatabase(name)
  if (!getMeta(db, 'title')) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('title', ?)").run(name)
  }

  let imported = 0
  let skipped = 0
  for (const batch of gameBatches(text, IMPORT_BATCH)) {
    const { games, failed } = parseBatch(batch)
    const { inserted, bad } = insertGames(db, games)
    imported += inserted
    skipped += failed + bad
    onProgress({ name, imported, skipped })
    // Yield so progress events reach the renderer between batches.
    await new Promise((resolve) => setImmediate(resolve))
  }
  countCache.delete(name)
  return { name, imported, skipped }
}

// ── Queries ─────────────────────────────────────────────────────────────────

function buildFilters(filters = {}) {
  const clauses = []
  const params = []
  const player = (filters.player ?? '').trim()
  if (player) {
    const like = `%${player}%`
    if (filters.side === 'white') {
      clauses.push('g.white LIKE ?')
      params.push(like)
    } else if (filters.side === 'black') {
      clauses.push('g.black LIKE ?')
      params.push(like)
    } else {
      clauses.push('(g.white LIKE ? OR g.black LIKE ?)')
      params.push(like, like)
    }
  }
  if (filters.result === '1-0' || filters.result === '0-1' || filters.result === '1/2-1/2') {
    clauses.push('g.result = ?')
    params.push(filters.result)
  }
  if (filters.since) {
    clauses.push('g.date >= ?')
    params.push(filters.since)
  }
  if (filters.until) {
    clauses.push('g.date <= ?')
    params.push(filters.until)
  }
  return { where: clauses.length ? ' AND ' + clauses.join(' AND ') : '', params }
}

function searchPosition(name, req) {
  const db = openDatabase(name)
  const key = String(req.fen).split(' ').slice(0, 2).join(' ')
  const { where, params } = buildFilters(req.filters)
  const rows = db
    .prepare(
      `SELECT p.move AS move,
         COUNT(*) AS total,
         SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END) AS white,
         SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END) AS black,
         SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END) AS draws,
         ROUND(AVG(CASE WHEN g.white_elo IS NOT NULL AND g.black_elo IS NOT NULL
                        THEN (g.white_elo + g.black_elo) / 2.0 END)) AS avg_elo
       FROM positions p JOIN games g ON g.id = p.game_id
       WHERE p.fen = ?${where}
       GROUP BY p.move
       ORDER BY total DESC
       LIMIT ${OPENINGS_LIMIT}`,
    )
    .all(key, ...params)
  return rows.map((r) => ({
    move: r.move,
    total: r.total,
    white: r.white,
    draws: r.draws,
    black: r.black,
    avgElo: r.avg_elo ?? null,
  }))
}

function listGames(name, req) {
  const db = openDatabase(name)
  const page = Math.max(1, Math.round(Number(req.page) || 1))
  const pageSize = Math.min(GAMES_PAGE_MAX, Math.max(1, Math.round(Number(req.pageSize) || 20)))
  const fenKey = req.fen ? String(req.fen).split(' ').slice(0, 2).join(' ') : null
  const join = fenKey ? 'JOIN positions p ON p.game_id = g.id AND p.fen = ?' : ''
  const joinParams = fenKey ? [fenKey] : []
  const { where, params } = buildFilters(req.filters)
  const count = db
    .prepare(`SELECT COUNT(*) AS n FROM games g ${join} WHERE 1=1${where}`)
    .get(...joinParams, ...params).n
  const games = db
    .prepare(
      `SELECT g.id, g.white, g.white_elo AS whiteElo, g.black, g.black_elo AS blackElo,
              g.result, g.event, g.site, g.date, g.ply_count AS plyCount
       FROM games g ${join}
       WHERE 1=1${where}
       ORDER BY g.date DESC, g.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...joinParams, ...params, pageSize, (page - 1) * pageSize)
  return { games, count }
}

function loadGame(name, id) {
  const db = openDatabase(name)
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id)
  if (!row) return null
  const headers = {}
  const set = (key, value) => {
    if (value !== null && value !== undefined && value !== '') headers[key] = String(value)
  }
  set('Event', row.event)
  set('Site', row.site)
  set('Date', row.date)
  set('White', row.white)
  set('Black', row.black)
  if (row.white_elo !== null) set('WhiteElo', row.white_elo)
  if (row.black_elo !== null) set('BlackElo', row.black_elo)
  set('Result', row.result)
  if (row.fen) {
    set('FEN', row.fen)
    set('SetUp', '1')
  }
  return { headers, moves: row.moves ? row.moves.split(' ') : [] }
}

function listDatabases() {
  const dir = databasesDir()
  let files = []
  try {
    files = fsSync.readdirSync(dir)
  } catch {
    return [] // no databases dir yet
  }
  const out = []
  for (const file of files) {
    if (!file.endsWith('.sqlite')) continue
    const name = file.slice(0, -'.sqlite'.length)
    try {
      const db = openDatabase(name)
      let gameCount = countCache.get(name)
      if (gameCount === undefined) {
        gameCount = db.prepare('SELECT COUNT(*) AS n FROM games').get().n
        countCache.set(name, gameCount)
      }
      out.push({ name, title: getMeta(db, 'title') ?? name, gameCount })
    } catch (err) {
      console.warn(`Ignoring unreadable database ${file}:`, err.message)
    }
  }
  return out
}

async function removeDatabase(name) {
  const db = openDatabases.get(name)
  if (db) {
    db.close()
    openDatabases.delete(name)
  }
  countCache.delete(name)
  const file = dbPath(name)
  for (const suffix of ['', '-wal', '-shm']) {
    await fs.rm(file + suffix, { force: true })
  }
  return true
}

// ── Lichess opening explorer ────────────────────────────────────────────────

// Fetched here (not the renderer) for the same reason as remotes.js: the
// packaged app loads from file:// and public APIs may send no CORS headers.
const EXPLORER_URL = 'https://explorer.lichess.org'
const EXPLORER_TIMEOUT_MS = 8000
const explorerCache = new Map() // url -> parsed response

async function explorer(req) {
  const kind = req.kind
  if (kind !== 'masters' && kind !== 'lichess') throw new Error('db-explorer: unknown source')
  const url = new URL(`${EXPLORER_URL}/${kind}`)
  url.searchParams.set('fen', req.fen)
  url.searchParams.set('moves', '12')
  url.searchParams.set('topGames', kind === 'masters' ? '12' : '8')
  // A signed-in OAuth token wins; a pasted personal token is the fallback.
  let token = typeof req.token === 'string' ? req.token.trim() : ''
  if (kind === 'lichess') {
    url.searchParams.set('recentGames', '0')
    token = (await lichessAuth.getAccessToken()) ?? token
    // The community endpoint requires authentication.
    if (!token) throw new Error('Sign in with Lichess — or paste an access token — to browse community games.')
  }
  const key = url.toString()
  if (explorerCache.has(key)) return explorerCache.get(key)

  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(key, { headers, signal: AbortSignal.timeout(EXPLORER_TIMEOUT_MS) })
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? 'Lichess rejected the access token — sign in again, or create a new one at lichess.org/account/oauth/token.'
        : `Lichess explorer error ${res.status}`,
    )
  }
  const data = await res.json()
  if (explorerCache.size >= 300) explorerCache.clear()
  explorerCache.set(key, data)
  return data
}

// ── IPC ─────────────────────────────────────────────────────────────────────

function register(ipcMain) {
  ipcMain.handle('db-list', () => listDatabases())

  ipcMain.handle('db-import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Import PGN into a database',
      filters: [{ name: 'PGN', extensions: ['pgn'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return importPgnFile(result.filePaths[0], (progress) => {
      if (!win.isDestroyed()) win.webContents.send('db-import-progress', progress)
    })
  })

  ipcMain.handle('db-search-position', (_event, req) => {
    if (!req || typeof req.database !== 'string' || typeof req.fen !== 'string') {
      throw new Error('db-search-position: invalid request')
    }
    return searchPosition(req.database, req)
  })

  ipcMain.handle('db-games', (_event, req) => {
    if (!req || typeof req.database !== 'string') throw new Error('db-games: invalid request')
    return listGames(req.database, req)
  })

  ipcMain.handle('db-load-game', (_event, req) => {
    if (!req || typeof req.database !== 'string' || typeof req.id !== 'number') {
      throw new Error('db-load-game: invalid request')
    }
    return loadGame(req.database, req.id)
  })

  ipcMain.handle('db-delete', (_event, req) => {
    if (!req || typeof req.name !== 'string') throw new Error('db-delete: invalid request')
    return removeDatabase(req.name)
  })

  ipcMain.handle('db-explorer', (_event, req) => {
    if (!req || typeof req.fen !== 'string') throw new Error('db-explorer: invalid request')
    return explorer(req)
  })
}

module.exports = {
  register,
  closeAll,
  // Exposed for tests and future IPC: the core file-level operations.
  importPgnFile,
  listDatabases,
  searchPosition,
  listGames,
  loadGame,
  removeDatabase,
  explorer,
}
