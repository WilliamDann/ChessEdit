import type { Position } from "chessops";
import { ChildNode, type Node, type PgnNodeData } from "chessops/pgn";
import { makeSanAndPlay, parseSan } from "chessops/san";

/**
 * Play a line of SAN moves from `position` (mutated) below `parent`. A move
 * matching an existing child is followed rather than duplicated, mirroring
 * how playing on the board joins an existing line.
 * @returns the child indices of the played moves, or null when none were.
 */
export default function addLine(parent: Node<PgnNodeData>, position: Position, sans: string[]): number[] | null {
  const indices: number[] = [];

  for (const san of sans) {
    const move = parseSan(position, san);
    if (!move) break;

    const played = makeSanAndPlay(position, move);
    let index = parent.children.findIndex(child => child.data.san === played);
    if (index === -1) {
      index = parent.children.length;
      parent.children.push(new ChildNode({ san: played }));
    }

    indices.push(index);
    parent = parent.children[index];
  }

  return indices.length > 0 ? indices : null;
}
