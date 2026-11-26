import { useEffect, useState } from 'react'
import { ChevronDown, FilePlus2, GitBranch, Pause, Play, Settings2, Square } from 'lucide-react'
import type { EngineLine, EngineProfile, GoMode } from './types'
import { ENGINE_COLORS, GO_DEFAULTS } from './types'
import { formatPv, formatScore } from './format'
import { useCurrentFen, useEngineActions, useEngineStoreSync } from './EngineContext'
import { lineAsGame } from './pv'
import { useChessActions, useChessState } from 'chessboard'
import EngineProfilesDialog from './EngineProfilesDialog'
import './engines.css'

/** Node counts as compact strings, like en-croissant's format util */
function formatNodes(nodes: number): string {
  if (nodes >= 1e9) return `${(nodes / 1e9).toFixed(1)}G`
  if (nodes >= 1e6) return `${(nodes / 1e6).toFixed(1)}M`
  if (nodes >= 1e3) return `${(nodes / 1e3).toFixed(1)}k`
  return String(nodes)
}

const LINE_CHOICES = [1, 2, 3, 4, 5]

const GO_KINDS: Array<{ kind: GoMode['kind']; label: string }> = [
  { kind: 'infinite', label: '∞' },
  { kind: 'depth', label: 'Depth' },
  { kind: 'time', label: 'Time' },
  { kind: 'nodes', label: 'Nodes' },
]

export default function EnginesPanel() {
  const store = useEngineStoreSync()
  const fen = useCurrentFen()
  const actions = useEngineActions()
  const [manageOpen, setManageOpen] = useState(false)

  const profiles = store.profiles
  const allRunning = profiles.length > 0 && profiles.every((p) => store.session(p.id)?.running)

  return (
    <div className="engines-panel">
      {profiles.length === 0 && (
        <div className="engines-empty">
          <p>No engines yet.</p>
          <p className="engines-empty-hint">
            Add a UCI engine binary (e.g. Stockfish) to analyze positions while you edit.
          </p>
          <button className="dialog-btn" onClick={() => setManageOpen(true)}>
            <Settings2 size={14} aria-hidden /> Add an engine
          </button>
        </div>
      )}

      {profiles.map((profile) => (
        <EngineCard key={profile.id} profile={profile} fen={fen} onManage={() => setManageOpen(true)} />
      ))}

      {profiles.length > 0 && (
        <div className="engines-footer">
          {profiles.length > 1 && (
            <button
              className="engines-footer-btn"
              onClick={() => {
                for (const p of profiles) actions.setRunning(p.id, !allRunning)
              }}
              title={allRunning ? 'Pause all engines' : 'Resume all engines'}
            >
              {allRunning ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
              {allRunning ? 'Pause all' : 'Resume all'}
            </button>
          )}
          <button className="engines-footer-btn" onClick={() => setManageOpen(true)}>
            <Settings2 size={14} aria-hidden /> Manage engines
          </button>
        </div>
      )}

      {manageOpen && <EngineProfilesDialog onClose={() => setManageOpen(false)} />}
    </div>
  )
}

function EngineCard({ profile, fen, onManage }: { profile: EngineProfile; fen: string; onManage: () => void }) {
  const store = useEngineStoreSync()
  const actions = useEngineActions()
  const chess = useChessState()
  const chessActions = useChessActions()
  const [expanded, setExpanded] = useState(false)

  // Publish the hovered PV so the board draws its full move trail. Forget it
  // when leaving the card or when the analyzed position changes underneath.
  useEffect(() => {
    store.setPvHover(null)
    return () => store.setPvHover(null)
  }, [fen, store])

  const setHover = (line: EngineLine | null) => {
    store.setPvHover(line ? { engineId: profile.id, fen, pvUci: line.pvUci, color: profile.color } : null)
  }

  const session = store.session(profile.id)
  const snapshot = store.snapshot(profile.id, fen)
  const color = ENGINE_COLORS.find((c) => c.id === profile.color) ?? ENGINE_COLORS[0]
  const running = session?.running ?? false
  const bestLine = snapshot?.lines[0]
  const isRemote = profile.kind !== 'local'

  const multipvSetting = session?.settings.find((s) => s.name === 'MultiPV')
  const threadsSetting = session?.settings.find((s) => s.name === 'Threads')
  const hashSetting = session?.settings.find((s) => s.name === 'Hash')

  return (
    <div className="engine-card" style={{ '--engine-color': color.hex } as React.CSSProperties}>
      <div className="engine-head">
        <button
          className={'engine-toggle' + (running ? ' running' : '')}
          onClick={() => actions.toggleRunning(profile.id)}
          title={running ? 'Pause analysis' : 'Resume analysis'}
          aria-label={running ? 'Pause analysis' : 'Resume analysis'}
        >
          {running ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
        </button>

        <button className="engine-title" onClick={() => setExpanded(!expanded)} title={profile.name}>
          <span className="engine-dot" style={{ background: color.hex }} aria-hidden />
          <span className="engine-name">{profile.name}</span>
        </button>

        {running && !snapshot && <span className="engine-hint">starting…</span>}
        {running && snapshot && snapshot.progress < 100 && (
          <span className="engine-hint" title="Nodes per second">
            {formatNodes(snapshot.nps)}n/s
          </span>
        )}
        {bestLine && (
          <>
            <span className="engine-stat" title="Evaluation">
              {formatScore(bestLine)}
            </span>
            <span className="engine-stat" title="Depth">
              d{bestLine.depth}
            </span>
            <span className="engine-stat" title="Nodes">
              {formatNodes(snapshot?.nodes ?? 0)}
            </span>
          </>
        )}
        {running && session?.error && <span className="engine-error">{session.error}</span>}
      </div>

      <div
        className={'engine-progress' + (running && snapshot && snapshot.progress < 100 ? ' live' : '')}
        role="progressbar"
        aria-valuenow={snapshot?.progress ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${snapshot?.progress ?? 0}%` }} />
      </div>

      {snapshot && snapshot.lines.length > 0 && (
        <div className="engine-lines">
          {snapshot.lines.map((line) => (
            <div className="engine-line" key={line.multipv} onMouseEnter={() => setHover(line)} onMouseLeave={() => setHover(null)}>
              <span className="engine-line-score">{formatScore(line)}</span>
              <span
                className="engine-line-moves"
                title={formatPv(fen, line.pvSan)}
              >
                {formatPv(fen, line.pvSan)}
              </span>
              <span className="engine-line-actions">
                <button
                  className="engine-line-btn"
                  onClick={() => chessActions.addVariation(chess.selected, line.pvSan)}
                  title="Add this PV as a subvariation of the current move"
                  aria-label="Add PV as subvariation"
                >
                  <GitBranch size={12} aria-hidden />
                </button>
                <button
                  className="engine-line-btn"
                  onClick={() => {
                    const game = lineAsGame(chess.games, chess.selected, line.pvSan)
                    if (game) chessActions.addGame(game)
                  }}
                  title="Add the previous moves and this PV as a new game"
                  aria-label="Add line as new game"
                >
                  <FilePlus2 size={12} aria-hidden />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {running && snapshot && snapshot.lines.length === 0 && !session?.error && (
        <div className="engine-hint" style={{ marginTop: 6 }}>
          {isRemote ? 'no cloud analysis for this position' : 'no analysis'}
        </div>
      )}

      {expanded && (
        <div className="engine-settings">
          {(multipvSetting || threadsSetting) && (
            <div className="engine-row">
              {multipvSetting && (
                <>
                  <span className="engine-label">Lines</span>
                  <div className="engine-segments" role="group" aria-label="Number of lines">
                    {LINE_CHOICES.map((n) => (
                      <button
                        key={n}
                        className={Number(multipvSetting.value ?? 1) === n ? 'active' : ''}
                        onClick={() => actions.setLines(profile.id, n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {threadsSetting && (
                <>
                  <span className="engine-label">Threads</span>
                  <input
                    className="engine-input"
                    type="number"
                    min={1}
                    value={Number(threadsSetting.value ?? 1)}
                    onChange={(e) => actions.setSetting(profile.id, 'Threads', Math.max(1, Number(e.target.value) || 1))}
                    title="Threads"
                    aria-label="Threads"
                  />
                </>
              )}
            </div>
          )}

          {session && !isRemote && (
            <div className="engine-row">
              <span className="engine-label">Go</span>
              <select
                className="engine-select"
                value={session.go.kind}
                onChange={(e) => {
                  const kind = e.target.value as GoMode['kind']
                  actions.setGo(
                    profile.id,
                    kind === 'infinite'
                      ? { kind: 'infinite' }
                      : { kind, value: session.go.kind === 'infinite' ? GO_DEFAULTS[kind] : session.go.value },
                  )
                }}
              >
                {GO_KINDS.map((g) => (
                  <option key={g.kind} value={g.kind}>
                    {g.label}
                  </option>
                ))}
              </select>
              {session.go.kind !== 'infinite' && (
                <input
                  className="engine-input"
                  type="number"
                  min={1}
                  value={session.go.value}
                  onChange={(e) => {
                    const value = Math.max(1, Number(e.target.value) || 1)
                    if (session.go.kind !== 'infinite') actions.setGo(profile.id, { kind: session.go.kind, value })
                  }}
                  aria-label="Go mode target"
                />
              )}
            </div>
          )}

          {hashSetting && (
            <div className="engine-row">
              <span className="engine-label">Hash (MB)</span>
              <input
                className="engine-input"
                type="number"
                min={1}
                value={Number(hashSetting.value ?? 16)}
                onChange={(e) => actions.setSetting(profile.id, 'Hash', Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          )}

          {session && (
            <div className="engine-row">
              <label className="engine-check">
                <input
                  type="checkbox"
                  checked={session.synced}
                  onChange={(e) => actions.setSynced(profile.id, e.target.checked)}
                />
                Sync settings to profile
              </label>
              <span className="dialog-spacer" />
              {!isRemote && (
                <>
                  <button className="engines-footer-btn" onClick={onManage} title="Edit all UCI options">
                    All options…
                  </button>
                  <button
                    className="engines-footer-btn"
                    onClick={() => actions.kill(profile.id)}
                    title="Kill the engine process"
                  >
                    <Square size={12} aria-hidden /> Kill
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
