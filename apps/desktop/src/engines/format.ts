import type { EngineLine } from './types'

/** Score from the engine's point of view (side to move of the analyzed fen) */
export function formatScore(line: EngineLine): string {
  if (line.scoreMate != null) return `#${line.scoreMate > 0 ? '' : '-'}${Math.abs(line.scoreMate)}`
  if (line.scoreCp != null) {
    const pawns = line.scoreCp / 100
    return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`
  }
  return '???'
}

/** Number the SAN sequence from the analyzed position: "1. e4 e5 2. Nf3" or
 *  "1... e5 2. Nf3" when black is to move */
export function formatPv(fen: string, pvSan: string[]): string {
  const fields = fen.split(' ')
  const whiteToMove = fields[1] !== 'b'
  let moveNo = Number.parseInt(fields[5] ?? '1', 10) || 1
  const out: string[] = []
  let whiteMove = whiteToMove
  pvSan.forEach((san, i) => {
    if (!whiteMove && i === 0) out.push(`${moveNo}...`)
    else if (whiteMove) out.push(`${moveNo}.`)
    out.push(san)
    if (!whiteMove) moveNo++
    whiteMove = !whiteMove
  })
  return out.join(' ')
}
