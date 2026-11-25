import { useEffect, useRef, useState } from 'react'
import type { DockviewApi } from 'dockview'
import { PANELS, addPanel, openDefaultLayout, type PanelId } from './windows/panels'

declare global {
  interface Window {
    windowControls?: {
      minimize: () => void
      toggleMaximize: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
      onMaximized: (cb: (maximized: boolean) => void) => () => void
    }
  }
}

type Props = {
  fileName: string | null
  onOpen: () => void
  onSave: () => void
  api: DockviewApi | null
  onOpenThemeDialog: () => void
}

// ── Menu model ────────────────────────────────────────────────────────────
// Adding entries anywhere (File/Edit/Help/…) is just data.

type MenuEntry =
  | { kind: 'item'; label: string; onClick: () => void; checked?: boolean; disabled?: boolean }
  | { kind: 'separator' }

function buildMenus({ onOpen, onSave, api, onOpenThemeDialog }: Omit<Props, 'fileName'>): Array<{ label: string; items: MenuEntry[] }> {
  return [
    {
      label: 'File',
      items: [
        { kind: 'item', label: 'Open…', onClick: onOpen },
        { kind: 'item', label: 'Save…', onClick: onSave },
        { kind: 'separator' },
        { kind: 'item', label: 'Exit', onClick: () => window.windowControls?.close() },
      ],
    },
    {
      label: 'Edit',
      items: [
        // Themes. Future customization options go here.
        { kind: 'item', label: 'Theme…', onClick: onOpenThemeDialog },
      ],
    },
    {
      label: 'Window',
      items: [
        ...(Object.keys(PANELS) as PanelId[]).map((id) => ({
          kind: 'item' as const,
          label: PANELS[id].title,
          checked: !!api?.getPanel(id),
          disabled: !api,
          onClick: () => api && addPanel(api, id),
        })),
        { kind: 'separator' },
        {
          kind: 'item',
          label: 'Reset layout',
          disabled: !api,
          onClick: () => api && openDefaultLayout(api),
        },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          kind: 'item',
          label: 'About ChessEdit',
          onClick: () => alert('ChessEdit — a desktop PGN editor'),
        },
      ],
    },
  ]
}

// ── Icons ─────────────────────────────────────────────────────────────────

// 12x12 line icons drawn with currentColor
const MinimizeIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M1.5 6h9" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
)
const MaximizeIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="1.5" y="1.5" width="9" height="9" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
)
const RestoreIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="1.5" y="3.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" fill="none" />
    <path d="M3.5 3.5v-2h7v7h-2" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
)
const CloseIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
)

function WindowButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      className={'wc-button' + (danger ? ' danger' : '')}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  )
}

/**
 * Frameless-window title bar with a native-style menu bar. The whole
 * bar is a drag handle; menus, buttons and controls opt out with
 * no-drag. Double-click on empty bar area toggles maximize.
 */
export default function TitleBar({ fileName, onOpen, onSave, api, onOpenThemeDialog }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [maximized, setMaximized] = useState(false)
  const menubarRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!menubarRef.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!window.windowControls) return
    void window.windowControls.isMaximized().then(setMaximized)
    return window.windowControls.onMaximized(setMaximized)
  }, [])

  const menus = buildMenus({ onOpen, onSave, api, onOpenThemeDialog })

  const renderEntries = (items: MenuEntry[]) =>
    items.map((entry, i) => {
      if (entry.kind === 'separator') return <hr key={i} />
      return (
        <button
          key={i}
          className="menu-item"
          disabled={entry.disabled}
          onClick={() => {
            entry.onClick()
            setOpen(null)
          }}
        >
          <span className="check">{entry.checked ? '✓' : ''}</span>
          {entry.label}
        </button>
      )
    })

  const selectMenu = (label: string) => {
    setOpen(open === label ? null : label)
  }

  return (
    <div className="titlebar">
      <span className="app-title">ChessEdit</span>

      <div className="menubar" ref={menubarRef}>
        {menus.map((menu) => (
          <div className="menu-root" key={menu.label}>
            <button
              className={'menu-label' + (open === menu.label ? ' open' : '')}
              onClick={() => selectMenu(menu.label)}
              onMouseEnter={() => {
                if (open && menu.label !== open) {
                  setOpen(menu.label) // switch menus while one is open
                }
              }}
            >
              {menu.label}
            </button>
            {open === menu.label && (
              <div className="menu">{renderEntries(menu.items)}</div>
            )}
          </div>
        ))}
      </div>

      <span className="file-name">{fileName ?? 'untitled'}</span>

      <div className="window-controls">
        <WindowButton title="Minimize" onClick={() => window.windowControls?.minimize()}>
          {MinimizeIcon}
        </WindowButton>
        <WindowButton
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => window.windowControls?.toggleMaximize()}
        >
          {maximized ? RestoreIcon : MaximizeIcon}
        </WindowButton>
        <WindowButton title="Close" danger onClick={() => window.windowControls?.close()}>
          {CloseIcon}
        </WindowButton>
      </div>
    </div>
  )
}
