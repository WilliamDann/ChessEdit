import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";

import { NAGs } from "../NAG";

/**
 * NAG badges drawn on the board: every NAG of the current move renders as
 * a small pill stacked down the right edge of the move's destination
 * square. Rendered via chessground's customSvg, which places the markup in
 * a 0..100 coordinate space spanning one square; CSS variables work since
 * the SVG is injected into the document.
 */

/** Badge fill per NAG class; unclassed NAGs (eval symbols) use the accent */
const NAG_TOKEN: Record<string, string> = {
  good: "var(--nag-good, green)",
  bad: "var(--nag-bad, red)",
  interesting: "var(--nag-interesting, cyan)",
  dubious: "var(--nag-dubious, darkorange)",
};

const BADGE_HEIGHT = 26;
const BADGE_GAP = 6;

const badgeFill = (nag: number): string => {
  const cls = NAGs[nag]?.className?.split(" ")[1];
  return (cls && NAG_TOKEN[cls]) || "var(--accent, #93c5fd)";
};

function badgeSvg(symbol: string, fill: string): string {
  const w = 15 + symbol.length * 11;
  return (
    `<rect x="1" y="1" width="${w}" height="${BADGE_HEIGHT}" rx="8" fill="${fill}"` +
    ` stroke="var(--bg, #fff)" stroke-opacity="0.4" stroke-width="2"/>` +
    `<text x="${1 + w / 2}" y="${1 + BADGE_HEIGHT / 2}" font-size="19" font-weight="700"` +
    ` text-anchor="middle" dominant-baseline="central" fill="var(--bg, #fff)">${symbol}</text>`
  );
}

/** One shape carrying up to two NAG pills for the move on `key`'s square */
export function nagBadgeShape(key: Key, nags: number[]): DrawShape {
  const badges = nags
    .slice(0, 2)
    .map((nag, i) => {
      const nag0 = NAGs[nag];
      if (!nag0?.symbol) return "";
      const w = 15 + nag0.symbol.length * 11;
      const x = 97 - w;
      const y = 3 + i * (BADGE_HEIGHT + BADGE_GAP);
      return `<g transform="translate(${x},${y})">${badgeSvg(nag0.symbol, badgeFill(nag))}</g>`;
    })
    .join("");
  return { orig: key, customSvg: { html: `<g data-nag="">${badges}</g>` } };
}

/** NAG badges ride the shapes pipeline but must never persist into PGN comments */
export const isNagShape = (shape: DrawShape): boolean =>
  shape.customSvg?.html.includes("data-nag") ?? false;
