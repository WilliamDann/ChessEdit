import type { PositionPath } from "../context/PositionPath";
import { lookup } from "../context/PositionPath";
import { useChessState } from "../context";
import { useChessActions } from "../context/useChessActions";

import ContextMenu from "./ContextMenu";

type Props = {
  /** Click coordinates (viewport) and the move the menu acts on. */
  x: number;
  y: number;
  path: PositionPath;
  onClose: () => void;
};

/** Right-click menu mirroring the VariationEditor actions for a move. */
export default function VariationMenu({ x, y, path, onClose }: Props) {
  const state = useChessState();
  const actions = useChessActions();
  const { node, position } = lookup(state.games, path);

  // A selected move can be anywhere in a variation's continuation.
  const branchDepth = path.reduce(
    (last, index, depth) => depth > 0 && index > 0 ? depth : last,
    -1,
  );
  const variationPath = path.slice(0, branchDepth + 1);
  const canMoveDown = branchDepth !== -1 &&
    variationPath[branchDepth] + 1 < lookup(state.games, variationPath.slice(0, -1)).node.children.length;

  return (
    <ContextMenu
      x={x}
      y={y}
      onClose={onClose}
      items={[
        {
          label: "Promote variation",
          disabled: branchDepth === -1,
          onSelect: () => actions.promoteVariation(variationPath),
        },
        {
          label: "Move variation up",
          disabled: branchDepth === -1,
          onSelect: () => actions.moveVariationUp(variationPath),
        },
        {
          label: "Move variation down",
          disabled: !canMoveDown,
          onSelect: () => actions.moveVariationDown(variationPath),
        },
        {
          label: "Delete variation",
          disabled: branchDepth === -1,
          danger: true,
          onSelect: () => actions.deleteVariation(variationPath),
        },
        { type: "separator" },
        {
          label: "Trim before",
          disabled: path.length <= 1,
          onSelect: () => actions.trimBefore(path),
        },
        {
          label: "Trim after",
          disabled: node.children.length === 0,
          onSelect: () => actions.trimAfter(path),
        },
        { type: "separator" },
        {
          label: "Fork",
          onSelect: () => actions.addPosition(position),
        },
      ]}
    />
  );
}
