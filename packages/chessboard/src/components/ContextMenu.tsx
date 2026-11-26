import { useEffect, useLayoutEffect, useRef, useState } from "react";

import "./context-menu.css";

export type ContextMenuItem =
  | {
      type?: "item";
      label: string;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void;
    }
  | { type: "separator" };

type Props = {
  /** Coordinates of the click that opened the menu (viewport coordinates). */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

/** Fixed-position popup menu; closes on outside click, Escape, scroll or blur. */
export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Clamp the menu inside the viewport once its rendered size is known.
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const isOutside = (target: EventTarget | null) =>
      ref.current !== null && target instanceof Node && !ref.current.contains(target);

    const onMouseDown = (event: MouseEvent) => {
      if (isOutside(event.target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onScroll = () => onClose();

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left: pos.x, top: pos.y }}>
      {items.map((item, idx) =>
        item.type === "separator" ? (
          <hr key={idx} />
        ) : (
          <button
            key={idx}
            type="button"
            role="menuitem"
            className={"context-menu-item" + (item.danger ? " danger" : "")}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
