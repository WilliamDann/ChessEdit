import type { Move } from "chessops"
import { useMemo } from "react";
import { isChildNode } from "chessops/pgn";
import type { Config } from "@lichess-org/chessground/config";
import type { DrawShape } from "@lichess-org/chessground/draw";

import Chessground from "./Chessground";
import { AnalysisConfig } from "../Configs";

import { useChessState } from "../context/ChessContext"
import { useChessActions } from "../context/useChessActions"
import { lookup } from "../context/PositionPath";
import { getShapes, withShapes } from "../context/commentShapes";

import { parseSquare } from "chessops";
import { makeSquare } from "chessops";
import { makeFen } from "chessops/fen";
import { parseSan } from "chessops/san";

import { nagBadgeShape, isNagShape } from "./nagBadge";

import "./board.css"

type Props = {
  config?: Config
  /** Overlay shapes (e.g. engine arrows) drawn on top of the comment shapes.
   *  They ride the shapes pipeline but never persist into the PGN. */
  extraShapes?: DrawShape[]
}

export default function Chessboard({ config = AnalysisConfig, extraShapes = [] }: Props) {
  const state = useChessState();
  const actions = useChessActions();

  const { game, node, position } = lookup(state.games, state.selected);
  const comments = isChildNode(node) ? node.data.comments : game.comments;
  const shapes = useMemo(() => getShapes(comments), [comments]);

  // NAG badges for the current move, drawn on its destination square. The
  // tree stores only SAN, so replay the parent position to find the move.
  const nagShapes = useMemo(() => {
    if (!isChildNode(node) || !node.data.nags?.length) return [];
    const parent = lookup(state.games, state.selected.slice(0, -1));
    const move = parseSan(parent.position, node.data.san);
    return move ? [nagBadgeShape(makeSquare(move.to), node.data.nags)] : [];
  }, [node, state.games, state.selected]);

  const fen = makeFen(position.toSetup());

  return (
    <Chessground
      fen={fen}
      config={config}
      shapes={[...shapes, ...nagShapes, ...extraShapes]}
      onShapesChange={(drawn) => actions.updateNode(state.selected, { comments: withShapes(comments, drawn.filter((s) => !isNagShape(s))) })}
      onMove={(origin, destination, _) => {
        actions.addMove({
          from: parseSquare(origin),
          to: parseSquare(destination)
        } as Move)
      }}
    />
  )
}
