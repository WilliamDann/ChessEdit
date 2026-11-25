import { useRef } from 'react'
import { DockviewReact, type DockviewApi, type DockviewReadyEvent } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import { components, openDefaultLayout } from './panels'

declare global {
  interface Window {
    layoutStore?: {
      load: () => Promise<string | null>
      save: (json: string) => Promise<void>
    }
  }
}

type Props = {
  dark: boolean
  onApiReady: (api: DockviewApi) => void
}

export function DockLayout({ dark, onApiReady }: Props) {
  const ready = useRef(false)

  const onReady = (event: DockviewReadyEvent) => {
    const api = event.api

    const restore = async () => {
      let restored = false
      try {
        const raw = await window.layoutStore?.load()
        if (raw) {
          api.fromJSON(JSON.parse(raw))
          restored = true
        }
      } catch {
        // corrupt or incompatible saved layout — fall back to the default
      }
      if (!restored) openDefaultLayout(api)
      ready.current = true
      onApiReady(api)
    }
    void restore()

    // Persist layout changes (debounced — drags fire many events)
    let timer: ReturnType<typeof setTimeout> | null = null
    api.onDidLayoutChange(() => {
      if (!ready.current) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void window.layoutStore?.save(JSON.stringify(api.toJSON()))
      }, 500)
    })
  }

  return (
    <DockviewReact
      components={components}
      onReady={onReady}
      className={dark ? 'dockview-theme-dark' : 'dockview-theme-light'}
    />
  )
}
