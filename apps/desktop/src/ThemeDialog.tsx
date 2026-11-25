import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Chessground } from '@lichess-org/chessground'
import {
  BOARD_THEMES,
  PIECE_THEMES,
  DEFAULT_THEME_ID,
  THEMES,
  type BoardTheme,
  type Palette,
} from './themes'

/** Dialog section with a clickable header that collapses its content */
function Section({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="dialog-section">
      <button
        type="button"
        className="dialog-section-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ChevronDown size={14} className={'chevron' + (open ? '' : ' collapsed')} aria-hidden />
        {label}
      </button>
      {open && children}
    </div>
  )
}

/**
 * Static start-position board for the preview pane. All board/piece theming
 * is CSS driven from data-*-theme attributes on <html>, so the instance
 * needs to be created once and never reconfigured.
 */
function BoardPreview() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const api = Chessground(ref.current, {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
      viewOnly: true,
      coordinates: false,
      drawable: { enabled: false },
    })
    // Keep the preview crisp while the dialog/window resizes
    const observer = new ResizeObserver(() => api.redrawAll())
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      api.destroy()
    }
  }, [])

  return <div ref={ref} className="board-preview" />
}

type Props = {
  /** All themes: built-ins merged with user themes */
  themes: Record<string, Palette>
  themeId: string
  transparency: number
  boardThemeId: string
  pieceThemeId: string
  onTheme: (id: string) => void
  onTransparency: (pct: number) => void
  onBoardTheme: (id: string) => void
  onPieceTheme: (id: string) => void
  onAddTheme: () => void
  onRefresh: () => void
  onClose: () => void
}

/**
 * Modal theme settings: collapsible pickers on the left, live preview on
 * the right. Changes apply live via the on* callbacks.
 */
export default function ThemeDialog({
  themes,
  themeId,
  transparency,
  boardThemeId,
  pieceThemeId,
  onTheme,
  onTransparency,
  onBoardTheme,
  onPieceTheme,
  onAddTheme,
  onRefresh,
  onClose,
}: Props) {
  // Close on Escape; overlay click is handled on the overlay itself
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Pick up theme files added since the dialog opened: refresh on mount
  // and whenever the app window regains focus (e.g. after Add themes…)
  useEffect(() => {
    void onRefresh()
    const onFocus = () => void onRefresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = themes[themeId] ?? THEMES[DEFAULT_THEME_ID]
  const chips = [current.accent, current.red, current.green, current.yellow, current.cyan].filter(
    (c): c is string => !!c,
  )

  return (
    <div
      className="dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Theme settings">
        <div className="dialog-titlebar">
          <span>Theme</span>
          <button className="dialog-close" onClick={onClose} aria-label="Close" title="Close">
            ✕
          </button>
        </div>

        <div className="dialog-body">
          <div className="dialog-controls">
            <Section label="Theme">
              <div className="theme-grid">
                {Object.entries(themes).map(([id, theme]) => (
                  <button
                    key={id}
                    className={'theme-option' + (themeId === id ? ' active' : '')}
                    onClick={() => onTheme(id)}
                  >
                    <span className="theme-swatch" style={{ background: theme.bg }}>
                      <span className="theme-swatch-accent" style={{ background: theme.accent }} />
                    </span>
                    <span className="theme-name">
                      {theme.label}
                      {themeId === id && <span className="theme-check">✓</span>}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Section label="Board theme">
              <div className="theme-grid">
                {Object.entries(BOARD_THEMES).map(([id, board]: [string, BoardTheme]) => (
                  <button
                    key={id}
                    className={'theme-option' + (boardThemeId === id ? ' active' : '')}
                    onClick={() => onBoardTheme(id)}
                  >
                    <span
                      className="board-swatch"
                      style={{
                        background: `repeating-conic-gradient(${board.dark} 0% 25%, ${board.light} 0% 50%)`,
                        backgroundSize: '10px 10px',
                      }}
                    />
                    <span className="theme-name">
                      {board.label}
                      {boardThemeId === id && <span className="theme-check">✓</span>}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Section label="Piece theme">
              <div className="theme-grid">
                {Object.entries(PIECE_THEMES).map(([id, piece]) => (
                  <button
                    key={id}
                    className={'theme-option piece-option' + (pieceThemeId === id ? ' active' : '')}
                    onClick={() => onPieceTheme(id)}
                  >
                    <span className="theme-name">
                      {piece.label}
                      {pieceThemeId === id && <span className="theme-check">✓</span>}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Section label="Background transparency">
              <div className="transparency-row">
                <input
                  type="range"
                  min={30}
                  max={100}
                  step={5}
                  value={transparency}
                  onChange={(e) => onTransparency(Number(e.target.value))}
                  aria-label="Background transparency"
                />
                <span className="transparency-value">{transparency}%</span>
              </div>
            </Section>
          </div>

          <div className="dialog-preview">
            <div className="preview-theme" style={{ background: current.bg, color: current.fg }}>
              <span className="preview-aa">Aa</span>
              {chips.map((c) => (
                <span key={c} className="preview-chip" style={{ background: c }} />
              ))}
            </div>
            <BoardPreview />
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-btn" onClick={onAddTheme}>
            Add themes…
          </button>
          <span className="dialog-spacer" />
          <button className="dialog-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
