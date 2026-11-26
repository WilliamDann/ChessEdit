import { useEffect, useMemo, useState } from 'react'
import { makePgn } from 'chessops/pgn'
import type { DockviewApi } from 'dockview'
import { ChessContext, useChessState } from 'chessboard'
import { DockLayout } from './windows/DockLayout'
import TitleBar from './TitleBar'
import { applyBoardTheme, applyPieceTheme, applyTheme, applyTransparency, getStoredBoardThemeId, getStoredPieceThemeId, getStoredThemeId, getStoredTransparency, isDark, saveBoardThemeId, savePieceThemeId, saveThemeId, saveTransparency, DEFAULT_BOARD_THEME_ID, DEFAULT_PIECE_THEME_ID, DEFAULT_THEME_ID, THEMES, type Palette } from './themes'
import ThemeDialog from './ThemeDialog'
import { EngineProvider, useEngineLifecycle } from './engines/EngineContext'
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
  // Engine search loop: runs while this workspace exists, independent of
  // whether the Engines panel is open.
  useEngineLifecycle()
  const [api, setApi] = useState<DockviewApi | null>(null)
  const [userThemes, setUserThemes] = useState<Record<string, Palette>>({})
  const [themeId, setThemeId] = useState<string>(() => getStoredThemeId() ?? DEFAULT_THEME_ID)
  const [transparency, setTransparency] = useState<number>(getStoredTransparency)
  const [boardThemeId, setBoardThemeId] = useState<string>(
    () => getStoredBoardThemeId() ?? DEFAULT_BOARD_THEME_ID,
  )
  const [pieceThemeId, setPieceThemeId] = useState<string>(
    () => getStoredPieceThemeId() ?? DEFAULT_PIECE_THEME_ID,
  )
  const [themeDialogOpen, setThemeDialogOpen] = useState(false)

  // Built-ins first; user themes (userData/themes/*.json) may override by id
  const themes = useMemo(() => ({ ...THEMES, ...userThemes }), [userThemes])
  const current = themes[themeId] ?? THEMES[DEFAULT_THEME_ID]

  const refreshThemes = async () => {
    const loaded = (await window.themeStore?.load()) ?? []
    setUserThemes(Object.fromEntries(loaded.map(({ id, palette }) => [id, palette])))
  }

  useEffect(() => {
    void refreshThemes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    saveThemeId(themeId)
    applyTheme(current)
  }, [themeId, current])

  useEffect(() => {
    saveTransparency(transparency)
    applyTransparency(transparency)
  }, [transparency])

  useEffect(() => {
    saveBoardThemeId(boardThemeId)
    applyBoardTheme(boardThemeId)
  }, [boardThemeId])

  useEffect(() => {
    savePieceThemeId(pieceThemeId)
    applyPieceTheme(pieceThemeId)
  }, [pieceThemeId])

  const save = async () => {
    // Same serialization the Import/Export panel displays: every game, PGN text
    const pgn = state.games.map(makePgn).join('\n\n')
    await window.pgnFile.save(pgn)
  }

  return (
    <>
      <div className="app">
        <TitleBar
          fileName={fileName}
          onOpen={onOpen}
          onSave={save}
          api={api}
          onOpenThemeDialog={() => setThemeDialogOpen(true)}
        />

        <div className="dock-area">
          <DockLayout dark={isDark(current)} onApiReady={setApi} />
        </div>
      </div>

      {themeDialogOpen && (
        <ThemeDialog
          themes={themes}
          themeId={themeId}
          transparency={transparency}
          boardThemeId={boardThemeId}
          pieceThemeId={pieceThemeId}
          onTheme={setThemeId}
          onTransparency={setTransparency}
          onBoardTheme={setBoardThemeId}
          onPieceTheme={setPieceThemeId}
          onAddTheme={() => void window.themeStore?.openDir()}
          onRefresh={() => void refreshThemes()}
          onClose={() => setThemeDialogOpen(false)}
        />
      )}
    </>
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
    <EngineProvider>
      <ChessContext key={version} pgn={pgn}>
        <Workspace fileName={fileName} onOpen={open} />
      </ChessContext>
    </EngineProvider>
  )
}
