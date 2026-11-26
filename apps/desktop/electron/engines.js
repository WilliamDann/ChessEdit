// UCI engine process management for the Electron main process.
//
// Mirrors en-croissant's Rust engine layer (src-tauri/src/engine/): one OS
// process per engine profile, a UCI handshake on spawn, `setoption` /
// `position` / `go` driven by renderer requests, and `info` lines parsed into
// per-multipv lines and streamed to the renderer (throttled) until `bestmove`.
//
// Re-searches are serialized per process: a new analyze() while searching
// sends `stop` and queues the new search — it starts on the matching
// `bestmove`, so stale `info` output can never be attributed to the new
// position.

const { spawn } = require('child_process')
const { BrowserWindow, dialog } = require('electron')
const path = require('path')
const readline = require('readline')

// How often parsed engine output is pushed to the renderer while searching
const EMIT_INTERVAL_MS = 100
const HANDSHAKE_TIMEOUT_MS = 8000
const QUIT_GRACE_MS = 300

/** Strip anything that could smuggle extra UCI commands through a value */
function sanitize(value) {
  return String(value).replace(/[\r\n\0]/g, ' ').trim()
}

function goCommand(go) {
  switch (go && go.kind) {
    case 'depth':
      return `go depth ${Math.max(1, Math.round(Number(go.value) || 1))}`
    case 'time':
      return `go movetime ${Math.max(1, Math.round(Number(go.value) || 1))}`
    case 'nodes':
      return `go nodes ${Math.max(1, Math.round(Number(go.value) || 1))}`
    default:
      return 'go infinite'
  }
}

/**
 * Parse an `info` line into {depth, multipv, scoreCp, scoreMate, nodes, nps, pv}.
 * Returns null for lines without usable analysis output (strings, partial
 * lower/upperbound updates, currmove spam, ...).
 */
function parseInfo(line) {
  const tokens = line.split(/\s+/)
  const out = { depth: 0, multipv: 1, scoreCp: undefined, scoreMate: undefined, nodes: 0, nps: 0, pv: [] }
  let pvMode = false
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (pvMode) {
      out.pv.push(t)
      continue
    }
    switch (t) {
      case 'depth':
        out.depth = Number(tokens[++i]) || 0
        break
      case 'multipv':
        out.multipv = Number(tokens[++i]) || 1
        break
      case 'score': {
        const kind = tokens[++i]
        const value = tokens[++i]
        if (kind === 'cp') out.scoreCp = Number(value)
        else if (kind === 'mate') out.scoreMate = Number(value)
        break
      }
      case 'nodes':
        out.nodes = Number(tokens[++i]) || 0
        break
      case 'nps':
        out.nps = Number(tokens[++i]) || 0
        break
      case 'pv':
        pvMode = true
        break
      case 'lowerbound':
      case 'upperbound':
      case 'string':
        return null
      default:
        break // unknown token (currmove, hashfull, ...) — skip harmlessly
    }
  }
  if (!out.pv.length && out.scoreCp === undefined && out.scoreMate === undefined) return null
  return out
}

/** Parse `option name <name> type <type> [default v] [min v] [max v] [var v]...` */
function parseOption(line) {
  const match = line.match(/^option name (.+?) type (\w+)(.*)$/)
  if (!match) return null
  const [, name, type, rest] = match
  const option = { name, type }
  const tokens = rest.trim().split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i]
    const value = tokens[i + 1]
    if (value === undefined) break
    if (key === 'default') option.default = value
    else if (key === 'min') option.min = Number(value)
    else if (key === 'max') option.max = Number(value)
    else if (key === 'var') (option.vars ||= []).push(value)
    else continue
    i++
  }
  if (option.type === 'check') option.default = option.default === 'true'
  else if (option.type === 'spin' && option.default !== undefined) option.default = Number(option.default)
  return option
}

function progressOf(search, final) {
  if (final) return 100
  const go = search.go
  if (!go || go.kind === 'infinite') return 0
  const target = Math.max(1, Number(go.value) || 1)
  let value
  if (go.kind === 'depth') value = search.depth
  else if (go.kind === 'nodes') value = search.nodes
  else value = Date.now() - search.startedAt
  return Math.min(99, Math.round((value / target) * 100))
}

class UciEngine {
  /**
   * @param {string} id engine profile id (used as the key in the manager)
   * @param {(payload: unknown) => void} sendInfo streams 'engine-info' events
   * @param {(payload: unknown) => void} sendError streams 'engine-error' events
   */
  constructor(id, sendInfo, sendError) {
    this.id = id
    this.sendInfo = sendInfo
    this.sendError = sendError
    this.path = ''
    this.child = null
    this.rl = null
    this.ready = false
    this.exited = false
    this.killing = false
    this.searching = false
    this.search = null
    this.pending = null
    this.applied = {}
    this.waiter = null
    this.emitTimer = null
    this.lastEmit = 0
    this.idName = ''
    this.options = []
  }

  /** Spawn (or respawn, e.g. after a path change / crash) and run the handshake.
   *  Concurrent calls for the same path share one initialization. */
  ensure(enginePath) {
    if (this.child && this.ready && !this.exited && !this.killing && this.path === enginePath) {
      return Promise.resolve()
    }
    if (this.initPromise && this.path === enginePath) return this.initPromise
    this.initPromise = this.spawnAndInit(enginePath).finally(() => {
      this.initPromise = null
    })
    return this.initPromise
  }

  async spawnAndInit(enginePath) {
    this.dispose()
    this.path = enginePath
    this.exited = false
    this.killing = false
    this.idName = ''
    this.options = []

    this.child = spawn(enginePath, [], {
      cwd: path.dirname(enginePath) || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.rl = readline.createInterface({ input: this.child.stdout })
    this.rl.on('line', (line) => this.onLine(line.trim()))
    this.child.stderr.setEncoding('utf-8')
    this.child.stderr.on('data', (chunk) => {
      // Engine stderr is diagnostic output only; surface it in the console
      console.warn(`[engine ${this.id}] stderr:`, chunk.trim())
    })
    this.child.on('error', (err) => {
      this.exited = true
      this.rejectWaiter(err)
      this.sendError({ engineId: this.id, message: `Failed to start engine: ${err.message}` })
    })
    this.child.on('exit', (code) => {
      this.exited = true
      this.child = null
      this.ready = false
      this.searching = false
      this.search = null
      this.rejectWaiter(new Error(`engine exited with code ${code}`))
      if (!this.killing) {
        this.sendError({ engineId: this.id, message: `Engine process exited (code ${code})` })
      }
    })

    this.send('uci')
    await this.waitFor('uciok')
    this.send('isready')
    await this.waitFor('readyok')
    this.ready = true
    // Fresh process: options must be applied before the next search
    this.applied = {}
  }

  waitFor(prefix) {
    if (this.waiter) this.waiter.reject(new Error('another handshake is pending'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiter?.resolve === resolve) this.waiter = null
        reject(new Error(`engine did not answer with "${prefix}" in time`))
      }, HANDSHAKE_TIMEOUT_MS)
      this.waiter = {
        prefix,
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
      }
    })
  }

  rejectWaiter(err) {
    if (this.waiter) {
      const waiter = this.waiter
      this.waiter = null
      waiter.reject(err)
    }
  }

  send(cmd) {
    if (!this.child || !this.child.stdin.writable) return
    this.child.stdin.write(cmd + '\n')
  }

  onLine(line) {
    if (!line) return
    if (line.startsWith('id name ')) this.idName = line.slice(8).trim()
    if (line.startsWith('option ')) {
      const option = parseOption(line)
      if (option) this.options.push(option)
    }
    if (this.waiter && line.startsWith(this.waiter.prefix)) {
      const waiter = this.waiter
      this.waiter = null
      waiter.resolve()
      return
    }
    if (line.startsWith('info')) this.onInfo(line)
    else if (line.startsWith('bestmove')) this.onBestMove()
  }

  onInfo(line) {
    if (!this.searching || !this.search) return
    const parsed = parseInfo(line)
    if (!parsed) return
    const search = this.search
    if (parsed.depth) search.depth = parsed.depth
    if (parsed.nodes) search.nodes = parsed.nodes
    if (parsed.nps) search.nps = parsed.nps
    search.lines.set(parsed.multipv, {
      multipv: parsed.multipv,
      depth: search.depth,
      scoreCp: parsed.scoreCp ?? null,
      scoreMate: parsed.scoreMate ?? null,
      nodes: search.nodes,
      nps: search.nps,
      pvUci: parsed.pv,
    })
    this.emit()
  }

  onBestMove() {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer)
      this.emitTimer = null
    }
    if (this.searching && this.search) this.emitNow(100)
    this.searching = false
    this.search = null
    if (this.pending) {
      const next = this.pending
      this.pending = null
      this.startSearch(next)
    }
  }

  /** Queue a search. While a search is running it starts after its bestmove. */
  async analyze(req) {
    await this.ensure(req.enginePath)
    if (this.searching) {
      this.pending = req
      this.send('stop')
      return
    }
    this.startSearch(req)
  }

  startSearch(req) {
    for (const option of req.options ?? []) {
      if (!option?.name) continue
      const value = sanitize(option.value ?? '')
      if (this.applied[option.name] === value) continue
      this.send(`setoption name ${sanitize(option.name)} value ${value}`)
      this.applied[option.name] = value
    }
    this.send(`position fen ${sanitize(req.fen)}`)
    this.send(goCommand(req.go))
    this.search = {
      fen: req.fen,
      go: req.go,
      lines: new Map(),
      depth: 0,
      nodes: 0,
      nps: 0,
      startedAt: Date.now(),
    }
    this.searching = true
    this.lastEmit = 0
    this.emitNow(0)
  }

  stop() {
    if (this.searching) this.send('stop')
  }

  kill() {
    this.killing = true
    this.pending = null
    if (this.searching) this.send('quit')
    this.dispose()
  }

  dispose() {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer)
      this.emitTimer = null
    }
    this.rejectWaiter(new Error('engine disposed'))
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
    if (this.child) {
      const child = this.child
      try {
        child.stdin.write('quit\n')
      } catch {
        // already gone
      }
      const killer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // already gone
        }
      }, QUIT_GRACE_MS)
      child.once('exit', () => clearTimeout(killer))
      try {
        child.kill()
      } catch {
        // already gone
      }
    }
    this.child = null
    this.ready = false
    this.searching = false
    this.search = null
  }

  /** Throttled emit: at most one event per EMIT_INTERVAL_MS */
  emit(progress) {
    const now = Date.now()
    if (this.emitTimer) return
    if (now - this.lastEmit >= EMIT_INTERVAL_MS) {
      this.emitNow(progress)
    } else {
      this.emitTimer = setTimeout(() => {
        this.emitTimer = null
        this.emitNow(progress)
      }, EMIT_INTERVAL_MS - (now - this.lastEmit))
    }
  }

  emitNow(progressOverride) {
    this.lastEmit = Date.now()
    if (!this.search) return
    const search = this.search
    const lines = [...search.lines.values()].sort((a, b) => a.multipv - b.multipv)
    this.sendInfo({
      engineId: this.id,
      fen: search.fen,
      lines,
      depth: search.depth,
      nodes: search.nodes,
      nps: search.nps,
      progress: progressOverride ?? progressOf(search),
    })
  }
}

/** Spawn an engine just to read its name and option list (add-engine form) */
async function readEngineConfig(enginePath) {
  const probe = new UciEngine('config-probe', () => {}, () => {})
  try {
    await probe.ensure(enginePath)
    return { name: probe.idName || path.basename(enginePath), options: probe.options }
  } finally {
    probe.kill()
  }
}

// ── Manager + IPC wiring ────────────────────────────────────────────────────

/** engine profile id -> UciEngine */
const engines = new Map()
let getTarget = () => null

function sendInfo(payload) {
  getTarget()?.webContents.send('engine-info', payload)
}

function sendError(payload) {
  getTarget()?.webContents.send('engine-error', payload)
}

function getEngine(id) {
  let engine = engines.get(id)
  if (!engine) {
    engine = new UciEngine(id, sendInfo, sendError)
    engines.set(id, engine)
  }
  return engine
}

/** @param {() => Electron.BrowserWindow | null} targetGetter */
function register(ipcMain, targetGetter) {
  getTarget = targetGetter

  ipcMain.handle('engine-open-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose engine binary',
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('engine-get-config', (_event, enginePath) => {
    if (typeof enginePath !== 'string' || !enginePath) throw new Error('engine-get-config: missing path')
    return readEngineConfig(enginePath)
  })

  ipcMain.handle('engine-analyze', async (_event, req) => {
    if (
      !req ||
      typeof req.engineId !== 'string' ||
      typeof req.enginePath !== 'string' ||
      typeof req.fen !== 'string'
    ) {
      throw new Error('engine-analyze: invalid request')
    }
    await getEngine(req.engineId).analyze(req)
    return true
  })

  ipcMain.handle('engine-stop', (_event, engineId) => {
    if (typeof engineId !== 'string') return false
    engines.get(engineId)?.stop()
    return true
  })

  ipcMain.handle('engine-kill', (_event, engineId) => {
    if (typeof engineId !== 'string') return false
    engines.get(engineId)?.kill()
    engines.delete(engineId)
    return true
  })
}

function killAll() {
  for (const engine of engines.values()) engine.kill()
  engines.clear()
}

module.exports = { register, killAll }
