import type { DrawShape } from '@lichess-org/chessground/draw'
import { isNormal, makeSquare, parseUci } from 'chessops'
import type { EngineProfile, EngineSnapshot, PvHover } from './types'
import { engineLineBrush } from './types'

/**
 * Board arrows from engine snapshots, following en-croissant's scheme:
 * every PV line is drawn as an arrow for its first move. The main line
 * (multipv 1) uses the engine's color at full strength; each following line
 * is progressively lighter. Arrow width shrinks as a line's win chance
 * drops away from the best line.
 */

/** Lichess's cp -> win chance model (percent, 50 = balanced) */
function winChance(scoreCp?: number | null, scoreMate?: number | null): number {
  if (scoreMate != null) return scoreMate > 0 ? 100 : 0
  const cp = scoreCp ?? 0
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

function lineWidthFor(delta: number, lineIndex: number): number {
  // Wider when close to the best line, and never wider than earlier lines
  const byDelta = delta < 2.5 ? 8 : delta < 5 ? 6 : 4
  return Math.min(byDelta, 8 - Math.min(lineIndex, 4))
}

export function engineArrows(
  entries: Array<{ profile: EngineProfile; snapshot: EngineSnapshot | undefined }>,
): DrawShape[] {
  const shapes: DrawShape[] = []
  for (const { profile, snapshot } of entries) {
    if (!snapshot) continue
    for (const [index, line] of snapshot.lines.entries()) {
      const uci = line.pvUci[0]
      if (!uci) continue
      const move = parseUci(uci)
      if (!move || !isNormal(move)) continue
      const from = makeSquare(move.from)
      const to = makeSquare(move.to)
      if (!from || !to) continue
      // A stronger line already covering this move wins (en-croissant dedupes
      // the same way, so stacked engines don't overdraw each other)
      if (shapes.some((s) => s.orig === from && s.dest === to)) continue
      const best = snapshot.lines[0]
      const delta = Math.max(
        0,
        winChance(best?.scoreCp, best?.scoreMate) - winChance(line.scoreCp, line.scoreMate),
      )
      shapes.push({
        orig: from,
        dest: to,
        brush: engineLineBrush(profile.color, index),
        modifiers: { lineWidth: lineWidthFor(delta, index) },
      })
    }
  }
  return shapes
}

/** Engine arrows ride the shapes pipeline but must never persist into PGN. */
export const isEngineShape = (shape: DrawShape): boolean =>
  typeof shape.brush === 'string' && shape.brush.startsWith('engine-')

/**
 * Arrows previewing a hovered PV: one arrow per move, fading and thinning
 * along the line so the trail reads in move order.
 */
export function pvTrailArrows(hover: PvHover | null): DrawShape[] {
  if (!hover) return []
  const shapes: DrawShape[] = []
  hover.pvUci.forEach((uci, index) => {
    const move = parseUci(uci)
    if (!move || !isNormal(move)) return
    const from = makeSquare(move.from)
    const to = makeSquare(move.to)
    if (!from || !to) return
    shapes.push({
      orig: from,
      dest: to,
      brush: engineLineBrush(hover.color, index),
      modifiers: { lineWidth: Math.max(4, 10 - index) },
    })
  })
  return shapes
}
