# ChessEdit

ChessEdit is a desktop app for studying and annotating chess games.

Open a PGN file — the standard format chess games are saved in, the same files you export from chess sites, databases, or engines — and you get the game on a board, every move and variation laid out in a readable tree, and everything you need to add your own notes, symbols, and analysis. When you're done, save it back to the same file, annotations included.

<p align="center">
  <img src="docs/screenshot.png" alt="The ChessEdit window: a board on the left, the annotated move tree in the middle, and annotation and comment panels on the right" width="100%">
</p>

## Why not just a text editor?

PGN files *are* text, but they're painful to read and worse to edit by hand. ChessEdit shows you the game the way you think about it:

- **The board is the source of truth.** Click a move in the tree and the board follows. Drag a piece on the board and the move is added to the game — or starts a new variation if you play something different.
- **Variations are first-class.** Sidelines live indented under the main line, and you decide which line becomes the main line.
- **Your notes look good.** Comments support formatting — **bold**, *italics*, lists — so study notes written for humans can stay in the game file itself.

## A quick tour

The window is built from panels you can arrange however you like (see *Window* in the menu bar). The default layout covers the essentials:

### The board (left)

Play through the game by dragging the pieces, or step through it:

| Key | Does |
|---|---|
| ← | Previous move |
| → | Next move |
| ↑ | Back to the previous variation |
| ↓ | On to the next variation |

The curved arrow in the corner flips the board.

Anything you play on the board becomes part of the game: play a move that's already in the tree and you follow it; play something new and ChessEdit offers it as a **variation** of the position.

### Move tree (middle)

Every move of every variation, in order, with annotations and comments shown inline. Click any move to jump there. The same panel has tabs for **Headers** (the game's info: players, event, date, result) and **Import/Export** (the raw PGN text, if you ever want to see or paste it directly).

### Annotations (right)

Pick a move and mark its quality, or pick a position and mark who's better. The symbols are the standard chess annotation glyphs, and they show up three ways: in the move tree, in the annotations list, and as a small badge on the board itself on the move's destination square.

**Move quality:**

| Symbol | Meaning |
|---|---|
| ! | Good move |
| ? | Mistake |
| !! | Brilliant move |
| ?? | Blunder |
| !? | Interesting move |
| ?! | Dubious move |
| □ | Only move |
| ⊙ | Zugzwang |

**Position:**

| Symbol | Meaning |
|---|---|
| = | Equal position |
| ∞ | Unclear |
| ⩲ / ⩱ | Slight advantage for White / Black |
| ± / ∓ | Moderate advantage |
| +− / −+ | Decisive advantage |

### Comments (right)

Write plain-language notes on any move or position — "this is where Black goes wrong", a plan, a to-do for your next game. Basic formatting works: `**bold**`, `*italics*`, and lists, matching what you'd write in a markdown-aware chat or editor.

### Variations (left)

Surgical tools for restructuring the game:

- **Fork** — start a new sideline from the current position
- **Promote variation** — make this sideline the main line
- **Move variation up / down** — reorder sidelines
- **Trim before / after** — cut everything before or after the current move (great for turning a full game into a focused study position)
- **Delete variation** — remove a sideline

### More than one game per file

A single PGN file can hold many games — a whole tournament, your season, a collection you're building. The **Games** panel lists them all; open it from the *Window* menu.

## Make it yours

Open **Edit → Theme…** to personalize the app. Everything applies live:

- **Theme** — the overall look of the app (light, dark, and plenty of colors in between). You can add your own: the "Add themes…" button opens a folder where each file becomes a theme.
- **Board theme** — 25+ boards, from classic brown and plain colors to wood, marble, and metal textures.
- **Piece theme** — 40+ piece sets, from the classic Staunton-style set to playful ones.
- **Background transparency** — how much the window shows through.

Your choices are remembered between sessions.

## Getting ChessEdit

ChessEdit is a desktop application for Linux (built with Electron). If you have the source code, this is all it takes:

```bash
npm install        # once, at the repo root
npm run dev        # run the app with live reloading
```

To run a packaged build:

```bash
npm run build
npm run start
```

A `sample.pgn` is included if you'd like something to click around in first.

## For developers

The repository has two workspace packages:

- `packages/chessboard/` — React chess components (board, move tree, PGN editors), imported by the app as `chessboard`
- `apps/desktop/` — the Electron app shell (native file open/save via IPC, React UI)

Other useful commands:

```bash
npm run typecheck  # type-check the desktop app
npm run lint:css   # stylelint the stylesheets
npm test           # chessboard package tests
```

Board and piece themes are generated from [lichess](https://lichess.org)'s public asset collection.
