import { useMemo } from 'react'
import { AnalysisConfig, Chessboard, useChessState } from 'chessboard'
import type { Config } from '@lichess-org/chessground/config'
import { makeFen } from 'chessops/fen'
import { lookup } from 'chessboard'
import { engineBrushes } from './types'
import { engineArrows, pvTrailArrows } from './arrows'
import { useEngineStoreSync } from './EngineContext'

/**
 * The Board panel with engine arrows layered on top of the user's shapes.
 * Arrow arrays are rebuilt only when the position changes or one of the
 * running engines commits a new snapshot (store `seq`), so the chessground
 * refresh effect is not triggered by unrelated engine traffic.
 */
export default function EngineBoard() {
  const store = useEngineStoreSync()
  const state = useChessState()
  const { position } = lookup(state.games, state.selected)
  const fen = makeFen(position.toSetup())

  const entries = store
    .visibleProfiles()
    .filter((p) => store.session(p.id)?.running)
    .map((profile) => ({ profile, snapshot: store.snapshot(profile.id, fen) }))

  // Hovered PV previews ride the same shapes pipeline; a hover for another
  // position (still set while the board catches up) is ignored.
  const hover = store.pvHover?.fen === fen ? store.pvHover : null

  // Stable dependency key: position + which engines are running + snapshot
  // versions. New array identity only when the arrows could have changed.
  const arrowsKey =
    fen +
    '#' +
    entries.map((e) => `${e.profile.id}:${e.profile.color}:${e.snapshot ? e.snapshot.seq : 0}`).join(',')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const arrows = useMemo(() => [...engineArrows(entries), ...pvTrailArrows(hover)], [arrowsKey, hover])

  // chessground deep-merges `drawable.brushes`, so the built-in brushes used
  // by user drawings stay intact alongside the engine-* brushes.
  const config = useMemo(
    () =>
      ({
        ...AnalysisConfig,
        drawable: { ...AnalysisConfig.drawable, brushes: engineBrushes() },
      }) as Config,
    [],
  )

  return <Chessboard config={config} extraShapes={arrows} />
}
