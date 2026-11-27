// Database panel — opening explorer over local SQLite databases and the
// Lichess opening explorer, modeled on en-croissant's DatabasePanel: every
// source is normalized into the same shape ({ openings, games }), the query
// re-runs whenever the board position changes (debounced), and clicking an
// opening row plays the move on the board.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, FolderOpen, RefreshCw, Trash2 } from 'lucide-react'
import type { Game, PgnNodeData } from 'chessops/pgn'
import { makeFen } from 'chessops/fen'
import { lookup, useChessActions, useChessState } from 'chessboard'
import type {
  DbGameRow,
  ExplorerKind,
  GameFilters,
  ImportProgress,
  LocalDatabaseInfo,
  OpeningStats,
} from '../db/api'
import { sanToMove, storedToGame, uciToSan } from '../db/games'
import './database.css'

type Source = 'local' | ExplorerKind

type DisplayOpening = OpeningStats & { san: string }

type DisplayGame = {
  key: string
  white: string
  whiteElo: number | null
  black: string
  blackElo: number | null
  result: string
  event: string | null
  date: string | null
  plyCount: number | null
  /** Only local rows can be loaded onto the board */
  dbId: number | null
}

const PAGE_SIZE = 20
const FEN_DEBOUNCE_MS = 60

const RESULT_LABELS: Record<string, string> = {
  '1-0': '1–0',
  '0-1': '0–1',
  '1/2-1/2': '½',
}

const SOURCES: Array<{ id: Source; label: string }> = [
  { id: 'lichess', label: 'Lichess' },
  { id: 'masters', label: 'Masters' },
  { id: 'local', label: 'Local' },
]

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function formatNumber(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}G`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export default function DatabasePanel() {
  const state = useChessState()
  const actions = useChessActions()

  const { position } = lookup(state.games, state.selected)
  const fen = makeFen(position.toSetup())
  const debouncedFen = useDebounced(fen, FEN_DEBOUNCE_MS)

  const [source, setSource] = useState<Source>(() => stored('db-source', 'masters'))
  const [databases, setDatabases] = useState<LocalDatabaseInfo[]>([])
  const [selectedDb, setSelectedDb] = useState<string | null>(() => stored('db-selected', null))
  const [token, setToken] = useState<string>(() => stored('db-lichess-token', ''))
  const [signedIn, setSignedIn] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [signinError, setSigninError] = useState<string | null>(null)
  const [filters, setFilters] = useState<GameFilters>({})
  const [tab, setTab] = useState<'openings' | 'games'>('openings')
  const [page, setPage] = useState(1)

  const [openings, setOpenings] = useState<DisplayOpening[]>([])
  const [games, setGames] = useState<DisplayGame[]>([])
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)

  const refreshDatabases = useCallback(async (preferred: string | null) => {
    const list = await window.db.list()
    setDatabases(list)
    setSelectedDb((current) => {
      const wanted = preferred ?? current
      if (wanted && list.some((d) => d.name === wanted)) return wanted
      return list[0]?.name ?? null
    })
  }, [])

  useEffect(() => {
    refreshDatabases(null).catch((err) => console.warn('databases:', err))
  }, [refreshDatabases])

  useEffect(() => window.db.onImportProgress(setProgress), [])

  useEffect(() => {
    window.db.lichessSession().then((s) => setSignedIn(s.signedIn)).catch(() => {})
  }, [])

  useEffect(() => localStorage.setItem('db-source', JSON.stringify(source)), [source])
  useEffect(() => {
    if (selectedDb) localStorage.setItem('db-selected', JSON.stringify(selectedDb))
  }, [selectedDb])
  useEffect(() => localStorage.setItem('db-lichess-token', JSON.stringify(token)), [token])

  // One normalized fetch per (source, position, filters, tab). Cancels via a
  // generation counter so a slow response can't overwrite a newer one.
  useEffect(() => {
    if (source === 'local' && !selectedDb) {
      setOpenings([])
      setGames([])
      setMatchCount(null)
      setError(null)
      return
    }    const generation = ++fetchGeneration
    let cancelled = false
    const isCurrent = () => !cancelled && generation === fetchGeneration

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        if (source === 'local') {
          if (!selectedDb) return
          const req = { database: selectedDb, fen: debouncedFen, filters }
          if (tab === 'openings') {
            const [rows, all] = await Promise.all([
              window.db.searchPosition(req),
              window.db.games({ ...req, page: 1, pageSize: 1 }),
            ])
            if (!isCurrent()) return
            setOpenings(rows.map((r) => ({ ...r, san: uciToSan(position, r.move) })))
            setGames([])
            setMatchCount(all.count)
          } else {
            const all = await window.db.games({ ...req, page, pageSize: PAGE_SIZE })
            if (!isCurrent()) return
            setOpenings([])
            setGames(all.games.map(toDisplayGame))
            setMatchCount(all.count)
          }
        } else {
          const data = await window.db.explorer({ kind: source, fen: debouncedFen, token })
          if (!isCurrent()) return
          const rows = data.moves.map((m) => ({
            move: m.uci,
            san: m.san ?? uciToSan(position, m.uci),
            total: m.white + m.draws + m.black,
            white: m.white,
            draws: m.draws,
            black: m.black,
            avgElo: m.averageRating ?? null,
          }))
          setOpenings(rows)
          setGames(
            data.topGames.map((g, i) => ({
              white: g.white.name ?? '?',
              whiteElo: g.white.rating ?? null,
              black: g.black.name ?? '?',
              blackElo: g.black.rating ?? null,
              result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½',
              event: null,
              date: g.year ? String(g.year) : null,
              plyCount: null,
              dbId: null,
              key: `${g.id}-${i}`,
            })),
          )
          setMatchCount(data.white + data.draws + data.black)
        }
      } catch (err) {
        if (isCurrent()) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (isCurrent()) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, selectedDb, debouncedFen, filters, tab, page, token, signedIn])

  // Navigating the board shouldn't leave the games tab on page 47.
  useEffect(() => setPage(1), [source, selectedDb, debouncedFen, filters, token])

  const startImport = async () => {
    setImporting(true)
    setProgress(null)
    try {
      const result = await window.db.importPgn()
      if (result) {
        await refreshDatabases(result.name)
        setSelectedDb(result.name)
      }
    } catch (err) {
      console.warn('import:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  const removeDatabase = async (name: string) => {
    await window.db.remove({ name })
    await refreshDatabases(null)
  }

  const signIn = async () => {
    setSigningIn(true)
    setSigninError(null)
    try {
      await window.db.signInLichess()
      setSignedIn(true)
    } catch (err) {
      setSigninError(err instanceof Error ? err.message : String(err))
    } finally {
      setSigningIn(false)
    }
  }

  const signOut = async () => {
    await window.db.signOutLichess()
    setSignedIn(false)
  }

  const playOpening = (row: DisplayOpening) => {
    const move = sanToMove(position, row.san)
    if (move) actions.addMove(move)
  }

  const loadStoredGame = async (row: DisplayGame) => {
    if (!selectedDb || row.dbId === null) return
    const storedGame = await window.db.loadGame({ database: selectedDb, id: row.dbId })
    if (!storedGame) return
    const game = storedToGame(storedGame)
    if (game) actions.addGame(game as Game<PgnNodeData>)
  }

  const total = matchCount
  const pages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1

  return (
    <div className="db-panel">
      <div className="db-toolbar">
        <div className="db-segments" role="group" aria-label="Database source">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              className={source === s.id ? 'active' : ''}
              onClick={() => setSource(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {source === 'local' && (
          <div className="db-dbrow">
            <select
              className="db-select"
              value={selectedDb ?? ''}
              onChange={(e) => setSelectedDb(e.target.value || null)}
              aria-label="Database"
            >
              {databases.length === 0 && <option value="">no databases yet</option>}
              {databases.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.title} ({formatNumber(d.gameCount)})
                </option>
              ))}
            </select>
            <button
              className="dialog-btn"
              onClick={startImport}
              disabled={importing}
              title="Import a PGN file into a local database"
            >
              <FolderOpen size={13} aria-hidden /> {importing ? 'Importing…' : 'Import PGN…'}
            </button>
            {selectedDb && (
              <button
                className="db-icon-btn"
                onClick={() => removeDatabase(selectedDb)}
                title={`Delete ${selectedDb}`}
                aria-label="Delete database"
              >
                <Trash2 size={13} aria-hidden />
              </button>
            )}
          </div>
        )}

        {source === 'lichess' && (
          <div className="db-dbrow">
            {signedIn ? (
              <>
                <span className="db-signedin">Signed in with Lichess</span>
                <button className="dialog-btn" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <button className="dialog-btn" onClick={signIn} disabled={signingIn}>
                {signingIn ? 'Waiting for browser…' : 'Sign in with Lichess'}
              </button>
            )}
            {!signedIn && (
              <input
                className="db-input"
                type="password"
                placeholder="…or paste an access token (lichess.org/account/oauth/token)"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                aria-label="Lichess access token"
              />
            )}
          </div>
        )}

        {source === 'local' && (
          <div className="db-filters">
            <input
              className="db-input"
              placeholder="Player"
              value={filters.player ?? ''}
              onChange={(e) => setFilters({ ...filters, player: e.target.value })}
              aria-label="Player filter"
            />
            <select
              className="db-select"
              value={filters.side ?? 'any'}
              onChange={(e) => setFilters({ ...filters, side: e.target.value as GameFilters['side'] })}
              aria-label="Player color"
            >
              <option value="any">either color</option>
              <option value="white">white only</option>
              <option value="black">black only</option>
            </select>
            <select
              className="db-select"
              value={filters.result ?? ''}
              onChange={(e) => setFilters({ ...filters, result: (e.target.value || undefined) as GameFilters['result'] })}
              aria-label="Result filter"
            >
              <option value="">any result</option>
              <option value="1-0">white wins</option>
              <option value="0-1">black wins</option>
              <option value="1/2-1/2">draws</option>
            </select>
          </div>
        )}
      </div>

      {importing && progress && (
        <div className="db-progress" role="progressbar" aria-label="Import progress">
          <span className="db-progress-text">
            {progress.name}: {formatNumber(progress.imported)} games
            {progress.skipped > 0 ? `, ${progress.skipped} skipped` : ''}
          </span>
        </div>
      )}

      <div className="db-tabs">
        <button className={tab === 'openings' ? 'active' : ''} onClick={() => setTab('openings')}>
          Moves
        </button>
        <button className={tab === 'games' ? 'active' : ''} onClick={() => setTab('games')}>
          Games
        </button>
        {total !== null && <span className="db-count">{formatNumber(total)} games</span>}
        {loading && <RefreshCw size={12} className="db-spinner" aria-label="Loading" />}
      </div>

      {error && <div className="db-error">{error}</div>}
      {signinError && <div className="db-error">{signinError}</div>}

      {source === 'local' && databases.length === 0 && !loading && (
        <div className="db-empty">
          <Database size={20} aria-hidden />
          <p>No local databases yet.</p>
          <p className="db-empty-hint">Import a PGN file (e.g. a Lichess or bulk download) to explore openings and games.</p>
          <button className="dialog-btn" onClick={startImport} disabled={importing}>
            <FolderOpen size={14} aria-hidden /> Import PGN…
          </button>
        </div>
      )}

      {tab === 'openings' && openings.length > 0 && (
        <div className="db-table" role="table" aria-label="Opening statistics">
          {openings.map((row) => {
            const w = (row.white / row.total) * 100
            const d = (row.draws / row.total) * 100
            return (
              <button key={row.move} className="db-openings-row" onClick={() => playOpening(row)}>
                <span className="db-openings-move">{row.san}</span>
                <span className="db-openings-count">{formatNumber(row.total)}</span>
                <span
                  className="db-openings-bar"
                  title={`${pct(w)} / ${pct(d)} / ${pct(100 - w - d)}`}
                >
                  <span style={{ width: `${w}%` }} className="w" />
                  <span style={{ width: `${d}%` }} className="d" />
                  <span style={{ width: `${100 - w - d}%` }} className="b" />
                </span>
                <span className="db-openings-elo">{row.avgElo ?? ''}</span>
              </button>
            )
          })}
        </div>
      )}

      {tab === 'games' && games.length > 0 && (
        <div className="db-table" role="table" aria-label="Games">
          {games.map((g) => (
            <button
              key={g.key}
              className="db-games-row"
              onClick={() => loadStoredGame(g)}
              disabled={g.dbId === null}
              title={g.dbId === null ? 'Only local database games can be loaded' : 'Load game'}
            >
              <span className="db-games-players">
                <span className="db-games-white">
                  {g.white}
                  {g.whiteElo ? ` ${g.whiteElo}` : ''}
                </span>
                <span className="db-games-result">{RESULT_LABELS[g.result] ?? g.result}</span>
                <span className="db-games-black">
                  {g.black}
                  {g.blackElo ? ` ${g.blackElo}` : ''}
                </span>
              </span>
              <span className="db-games-meta">
                {[g.event, g.date, g.plyCount ? `${g.plyCount} plies` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}

      {tab === 'openings' && !loading && openings.length === 0 && !error && !(source === 'local' && !selectedDb) && (
        <div className="db-none">No games reached this position.</div>
      )}
      {tab === 'games' && !loading && games.length === 0 && !error && !(source === 'local' && !selectedDb) && (
        <div className="db-none">No matching games.</div>
      )}

      {source === 'local' && tab === 'games' && pages > 1 && (
        <div className="db-pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ←
          </button>
          <span>
            {page} / {pages}
          </span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
            →
          </button>
        </div>
      )}
    </div>
  )
}

function toDisplayGame(row: DbGameRow): DisplayGame {
  return {
    key: String(row.id),
    dbId: row.id,
    white: row.white,
    whiteElo: row.whiteElo,
    black: row.black,
    blackElo: row.blackElo,
    result: row.result,
    event: row.event,
    date: row.date,
    plyCount: row.plyCount,
  }
}

function pct(value: number): string {
  return `${Math.round(value)}%`
}

// Bumped on every fetch so stale responses lose races (no SWR dependency).
let fetchGeneration = 0
