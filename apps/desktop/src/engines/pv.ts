import type { Game, PgnNodeData } from 'chessops/pgn'
import { defaultGame, startingPosition } from 'chessops/pgn'
import { addLine, lookup } from 'chessboard'
import type { PositionPath } from 'chessboard'

/**
 * A new game holding the moves along `path` plus a SAN continuation — used to
 * save the moves leading to the analyzed position together with an engine PV.
 * The source game's headers are copied, including any custom starting FEN.
 */
export function lineAsGame(
  games: Game<PgnNodeData>[],
  path: PositionPath,
  continuation: string[],
): Game<PgnNodeData> | null {
  const { game } = lookup(games, path)

  const sans: string[] = []
  let node = game.moves
  for (const index of path.slice(1)) {
    const child = node.children[index]
    if (!child) break
    sans.push(child.data.san)
    node = child
  }
  sans.push(...continuation)
  if (sans.length === 0) return null

  const line = defaultGame<PgnNodeData>()
  for (const [key, value] of game.headers) line.headers.set(key, value)

  const position = startingPosition(line.headers).unwrap()
  if (!addLine(line.moves, position, sans)) return null
  return line
}
