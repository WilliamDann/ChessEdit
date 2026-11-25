# chess-editor

Desktop PGN editor. Two workspace packages:

- `packages/chessboard/` — React chess components (board, move tree, PGN editors), imported by the app as `chessboard`
- `apps/desktop/` — the Electron app shell (native file open/save via IPC, React UI)

## Develop

```bash
npm install        # once, at the repo root
npm run dev        # rebuilds the lib on change + launches the app with hot reload
```

## Build & run production

```bash
npm run build
npm run start
```
