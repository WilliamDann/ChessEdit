// Remote cloud analysis: Lichess cloud evals and the ChessDB community cloud.
//
// These are modeled as remote "engines" (EngineProfile.kind) and flow through
// the same renderer pipeline as local UCI engines — the panel, arrows, colors
// and per-FEN cache all work unchanged. Fetches happen here in the main
// process because ChessDB sends no CORS headers (and the packaged app loads
// from file://), so the renderer cannot call it directly.
//
// Score conventions, matched to our engine-POV (side to move):
// - lichess cloud-eval scores are WHITE-relative → negate for black to move
// - chessdb scores are white-relative with special high ranges encoding
//   tablebase results → negate for black, decode via chessDbScoreToEngine

const CLOUD_TIMEOUT_MS = 8000

const LICHESS_CLOUD_URL = 'https://lichess.org/api/cloud-eval'
const CHESSDB_URL = 'https://www.chessdb.cn/cdb.php'

// Per-FEN caches so revisiting a position doesn't re-hit the public APIs.
// Null is cached too (a position with no cloud eval won't change).
const caches = { 'lichess-cloud': new Map(), chessdb: new Map() }

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null // network error / timeout — treated like "no data"
  }
}

// ── Lichess cloud evals ─────────────────────────────────────────────────────

function lichessCloud(fen, multiPv) {
  const cacheKey = `${fen}|${multiPv}`
  if (caches['lichess-cloud'].has(cacheKey)) return Promise.resolve(caches['lichess-cloud'].get(cacheKey))

  const url = new URL(LICHESS_CLOUD_URL)
  url.searchParams.set('fen', fen)
  url.searchParams.set('multiPv', String(Math.max(1, Math.min(5, multiPv))))
  const promise = fetchJson(url).then((data) => {
    // null (404/network) → empty snapshot: the position simply has no eval
    let result = { depth: 0, nodes: 0, lines: [] }
    if (data && Array.isArray(data.pvs)) {
      const negate = fen.split(' ')[1] === 'b'
      const nodes = Math.round((data.knodes ?? 0) * 1000)
      result = {
        depth: data.depth ?? 0,
        nodes,
        lines: data.pvs.map((pv, i) => ({
          multipv: i + 1,
          depth: data.depth ?? 0,
          scoreCp: pv.cp === undefined ? null : negate ? -pv.cp : pv.cp,
          scoreMate: pv.mate === undefined ? null : negate ? -pv.mate : pv.mate,
          nodes,
          nps: 0,
          pvUci: pv.moves ? pv.moves.split(' ') : [],
        })),
      }
    }
    caches['lichess-cloud'].set(cacheKey, result)
    return result
  })
  caches['lichess-cloud'].set(cacheKey, promise)
  return promise
}

// ── ChessDB community cloud ─────────────────────────────────────────────────

/**
 * chessdb encodes tablebase results in the score's high ranges
 * (mirrors en-croissant's chessDBevalToScore). Mate decodes exactly; the
 * DTZ bands display as a decisive centipawn score since we don't render DTZ.
 */
function chessDbScoreToEngine(score) {
  if (Math.abs(score) > 25000) {
    return { scoreCp: null, scoreMate: Math.floor((30000 - Math.abs(score) + 1) / 2) * (score > 0 ? 1 : -1) }
  }
  return { scoreCp: score, scoreMate: null }
}

async function chessdb(fen, multiPv) {
  const cacheKey = `${fen}|${multiPv}`
  if (caches.chessdb.has(cacheKey)) return caches.chessdb.get(cacheKey)
  const promise = queryChessDb(fen, multiPv)
  caches.chessdb.set(cacheKey, promise)
  return promise
}

async function queryChessDb(fen, multiPv) {
  const url = new URL(CHESSDB_URL)
  url.searchParams.set('action', 'queryall')
  url.searchParams.set('json', '1')
  url.searchParams.set('board', fen)
  const all = await fetchJson(url)
  if (!all || all.status !== 'ok' || !Array.isArray(all.moves)) {
    return { depth: 0, nodes: 0, lines: [] } // known position, no data
  }

  // chessdb scores are white-relative
  const negate = fen.split(' ')[1] === 'b'
  const moves = all.moves.map((m) => ({ ...m, score: negate ? -m.score : m.score }))

  // The ranked `queryall` lines are single-move; the best line's full PV
  // (and the analysis depth) comes from `querypv`.
  const pvUrl = new URL(CHESSDB_URL)
  pvUrl.searchParams.set('action', 'querypv')
  pvUrl.searchParams.set('json', '1')
  pvUrl.searchParams.set('stable', '1')
  pvUrl.searchParams.set('board', fen)
  const best = await fetchJson(pvUrl)
  const bestPv = best && best.status === 'ok' && Array.isArray(best.pv) ? best : null

  const lines = moves.slice(0, Math.max(1, Math.min(5, multiPv))).map((move, i) => {
    const { scoreCp, scoreMate } = chessDbScoreToEngine(move.score)
    const full = i === 0 && bestPv ? bestPv : null
    return {
      multipv: i + 1,
      depth: full?.depth ?? 0,
      scoreCp,
      scoreMate,
      nodes: 0,
      nps: 0,
      pvUci: full ? [...full.pv] : [move.uci],
    }
  })
  return { depth: bestPv?.depth ?? 0, nodes: 0, lines }
}

// ── IPC ─────────────────────────────────────────────────────────────────────

function register(ipcMain) {
  ipcMain.handle('remote-analyze', async (_event, req) => {
    if (!req || typeof req.fen !== 'string' || (req.kind !== 'lichess-cloud' && req.kind !== 'chessdb')) {
      throw new Error('remote-analyze: invalid request')
    }
    const multiPv = Math.max(1, Math.round(Number(req.lines) || 1))
    if (req.kind === 'lichess-cloud') return lichessCloud(req.fen, multiPv)
    return chessdb(req.fen, multiPv)
  })
}

module.exports = { register }
