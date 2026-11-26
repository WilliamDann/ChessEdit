import { useState, type MouseEvent as ReactMouseEvent } from "react";

import type { PositionPath } from "../context/PositionPath";
import { useChessState } from "../context/ChessContext"
import { useChessActions } from "../context/useChessActions"
import MoveTreeNode from "./MoveTreeNode"
import VariationMenu from "./VariationMenu"

import "./tree.css"

type MenuState = { x: number; y: number; path: PositionPath };

export default function MoveTree() {
  const actions = useChessActions();
  const { games, selected } = useChessState();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const gameIndex = selected[0];
  const game = games[gameIndex];

  if (!game.moves.children[0]) return null;

  const handleContextMenu = (path: PositionPath, event: ReactMouseEvent) => {
    event.preventDefault();
    actions.select(path);
    setMenu({ x: event.clientX, y: event.clientY, path });
  };

  return (
    <>
      <div className="move-tree mainline">
        <MoveTreeNode
          onSelected={actions.select}
          onContextMenu={handleContextMenu}
          path={[gameIndex, 0]}
        />
        {game.moves.children.slice(1).map((_, index) => (
          <div className="variation" key={index}>
            <MoveTreeNode
              onSelected={actions.select}
              onContextMenu={handleContextMenu}
              path={[gameIndex, index + 1]}
            />
          </div>
        ))}
      </div>
      {menu && (
        <VariationMenu
          x={menu.x}
          y={menu.y}
          path={menu.path}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
