import { useState } from 'react'
import { makePgn } from 'chessops/pgn'
import Analysis, { ChessContext, useChessState } from 'chessboard'
import './App.css'

declare global {
  interface Window {
    pgnFile: {
      open: () => Promise<{ filePath: string; contents: string } | null>
      save: (contents: string) => Promise<string | null>
    }
  }
}

// Everything that needs to read the games lives inside ChessContext.
function Workspace({ fileName, onOpen }: { fileName: string | null; onOpen: () => void }) {
  const state = useChessState()

  const save = async () => {
    // Same serialization ImportExport displays: every game, PGN text
    const pgn = state.games.map(makePgn).join('\n\n')
    await window.pgnFile.save(pgn)
  }

  return (
    <div className="app">
      <div className="toolbar">
        <button onClick={onOpen}>Open…</button>
        <button onClick={save}>Save…</button>
        <span className="file-name">{fileName ?? 'untitled'}</span>
      </div>

      <Analysis />
    </div>
  )
}

export default function App() {
  const [pgn, setPgn] = useState<string | undefined>()
  const [version, setVersion] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)

  const open = async () => {
    const result = await window.pgnFile.open()
    if (!result) return
    setPgn(result.contents)
    setFileName(result.filePath.split('/').pop() ?? result.filePath)
    // ChessContext parses `pgn` on mount — bump the key to reload
    setVersion((v) => v + 1)
  }

  return (
    <ChessContext key={version} pgn={pgn}>
      <Workspace fileName={fileName} onOpen={open} />
    </ChessContext>
  )
}
