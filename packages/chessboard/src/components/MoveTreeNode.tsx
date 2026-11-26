import type { MouseEvent as ReactMouseEvent } from "react";
import type { PositionPath } from "../context/PositionPath";

import { lookup } from "../context/PositionPath"
import { useChessState } from "../context";

import Move from "./Move";

type Props = {
  path: PositionPath;
  onSelected: (selection: PositionPath) => void;
  onContextMenu?: (path: PositionPath, event: ReactMouseEvent) => void;
}

export default function MoveTreeNode({ path, onSelected, onContextMenu }: Props) {
  return (
    <>
      <Move
        onSelected={() => onSelected(path)}
        onContextMenu={onContextMenu && ((event) => onContextMenu(path, event))}
        path={path}
        variation
      />
      <MoveTreeContinuation path={path} onSelected={onSelected} onContextMenu={onContextMenu} />
    </>
  )
}

function MoveTreeContinuation({ path, onSelected, onContextMenu }: Props) {
  const state = useChessState()
  const { node } = lookup(state.games, path);

  const mainline = node.children[0]
  if (!mainline) return null

  const mainlinePath = [...path, 0]

  return (
    <>
      <Move
        onSelected={() => onSelected(mainlinePath)}
        onContextMenu={onContextMenu && ((event) => onContextMenu(mainlinePath, event))}
        path={mainlinePath}
      />
      {node.children.slice(1).map((_, idx) => (
        <div className="variation" key={idx}>
          <MoveTreeNode onSelected={onSelected} onContextMenu={onContextMenu} path={[...path, idx + 1]} />
        </div>
      ))}
      <MoveTreeContinuation path={mainlinePath} onSelected={onSelected} onContextMenu={onContextMenu} />
    </>
  )
}
