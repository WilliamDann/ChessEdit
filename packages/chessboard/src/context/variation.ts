import type { ChessActionOf, ChessState } from "./ChessReducer";
import { lookup } from "./PositionPath";
import cloneTree from "./cloneTree";
import addLine from "./line";
import replaceGame from "./replaceGame";

/** Attach a line of SAN moves (e.g. an engine PV) as a subvariation of the
 *  node at `path`. Selection is left alone so several lines can be captured
 *  one after another at the same position. */
export default function variation(state: ChessState, action: ChessActionOf<"variation">): ChessState {
  const { game, position } = lookup(state.games, action.path);
  const moves = cloneTree(game.moves);
  const parent = action.path.slice(1).reduce(
    (node, index) => node.children[index],
    moves,
  );

  const indices = addLine(parent, position, action.sans);
  if (!indices) return state;

  return replaceGame(state, action.path[0], { ...game, moves });
}
