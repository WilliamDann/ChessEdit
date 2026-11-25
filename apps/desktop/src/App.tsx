import { useEffect, useMemo, useState } from 'react'
import { makePgn } from 'chessops/pgn'
import type { DockviewApi } from 'dockview'
import { ChessContext, useChessState } from 'chessboard'
import { DockLayout } from './windows/DockLayout'
import TitleBar from './TitleBar'
import { applyTheme, getStoredThemeId, isDark, saveThemeId, DEFAULT_THEME_ID, THEMES, type Palette } from './themes'
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
  const [api, setApi] = useState<DockviewApi | null>(null)
  const [userThemes, setUserThemes] = useState<Record<string, Palette>>({})
  const [themeId, setThemeId] = useState<string>(() => getStoredThemeId() ?? DEFAULT_THEME_ID)

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

  const save = async () => {
    // Same serialization the Import/Export panel displays: every game, PGN text
    const pgn = state.games.map(makePgn).join('\n\n')
    await window.pgnFile.save(pgn)
  }

  return (
    <div className="app">
      <TitleBar
        fileName={fileName}
        onOpen={onOpen}
        onSave={save}
        api={api}
        themes={themes}
        themeId={themeId}
        onTheme={setThemeId}
        onEditMenuOpen={() => void refreshThemes()}
        onAddTheme={() => void window.themeStore?.openDir()}
      />

      <div className="dock-area">
        <DockLayout dark={isDark(current)} onApiReady={setApi} />
      </div>
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
