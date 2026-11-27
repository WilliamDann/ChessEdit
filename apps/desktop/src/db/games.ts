// Convert stored database games and UCI moves into chessops game trees the
// editor understands — the mirror image of what electron/databases.js writes.

import { parseUci } from 'chessops'
import { Chess } from 'chessops/chess'
import { ChildNode, defaultGame, startingPosition } from 'chessops/pgn'
import type { Game, PgnNodeData } from 'chessops/pgn'
import type { Position } from 'chessops'
import { makeSanAndPlay, parseSan } from 'chessops/san'
import type { StoredGame } from './api'

/** Build an editable game (headers + main line) from a stored database game.
 *  Returns null when the stored moves no longer form a legal game. */
export function storedToGame(stored: StoredGame): Game<PgnNodeData> | null {
  const game = defaultGame<PgnNodeData>()
  for (const [key, value] of Object.entries(stored.headers)) {
    if (value) game.headers.set(key, value)
  }

  let position
  try {
    position = startingPosition(game.headers).unwrap()
  } catch {
    return null
  }
  if (!(position instanceof Chess)) return null

  let node = game.moves
  for (const uci of stored.moves) {
    const move = parseUci(uci)
    if (!move || !position.isLegal(move)) return null
    const san = makeSanAndPlay(position, move)
    const child = new ChildNode({ san })
    node.children.push(child)
    node = child
  }
  return game
}

/** UCI → SAN in the given position (the database stores UCI, the UI speaks SAN). */
export function uciToSan(position: Position, uci: string): string {
  const move = parseUci(uci)
  if (!move || !position.isLegal(move)) return uci
  return makeSanAndPlay(position.clone(), move)
}

/** SAN of the move a database row played from the current position, as a
 *  chessops Move ready to be played on the board. */
export function sanToMove(position: Position, san: string) {
  return parseSan(position, san)
}
