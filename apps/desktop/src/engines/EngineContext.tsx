import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import type { EngineProfile } from './types'
import { EngineStore, nextFreeColor } from './EngineStore'
import { useChessState } from 'chessboard'
import { lookup } from 'chessboard'

const EngineContext = createContext<EngineStore | null>(null)

/**
 * Sits above ChessContext (so engine state survives opening a new file) and
 * owns the bridge to the main-process engine host.
 */
export function EngineProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new EngineStore(), [])

  useEffect(() => {
    void store.load()
  }, [store])

  // Stream engine events into the store. Snapshots are keyed by
  // `${engineId}|${fen}` in the store, so late events for other positions
  // only warm the cache — the view reads exactly the current key.
  useEffect(() => {
    const offInfo = window.engineHost?.onInfo((info) => store.applyInfo(info))
    const offError = window.engineHost?.onError((err) => store.markError(err.engineId, err.message))
    return () => {
      offInfo?.()
      offError?.()
    }
  }, [store])

  return <EngineContext.Provider value={store}>{children}</EngineContext.Provider>
}

export function useEngineStore(): EngineStore {
  const store = useContext(EngineContext)
  if (!store) throw new Error('useEngineStore must be used inside <EngineProvider>')
  return store
}

/** Subscribe the calling component to engine store updates (any engine). */
export function useEngineStoreSync(): EngineStore {
  const store = useEngineStore()
  useSyncExternalStore(store.subscribe, store.getVersion)
  return store
}

/** FEN of the currently selected position — the engine analysis target */
export function useCurrentFen(): string {
  const state = useChessState()
  const { position } = lookup(state.games, state.selected)
  return makeFen(position.toSetup())
}

/**
 * The engine search loop (mirrors en-croissant's EvalListener): for every
 * visible engine whose session is running, request analysis of the current
 * position — or stop it when paused / game over. Re-runs only when the
 * position or an engine's effective config actually changes; the store
 * version subscription re-renders but the fingerprint keeps this effect off
 * the ~10Hz info-event path.
 */
export function useEngineLifecycle(): void {
  const store = useEngineStoreSync()
  const fen = useCurrentFen()
  const host = window.engineHost
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const lastRun = useRef(new Map<string, number>())
  const THROTTLE_MS = 80

  const fingerprint =
    fen +
    '#' +
    store.visibleProfiles()
      .map((p) => {
        const session = store.sessions[p.id]
        return [
          p.id,
          session?.running ? 1 : 0,
          JSON.stringify(session?.go ?? null),
          JSON.stringify(session?.settings ?? []),
        ].join(':')
      })
      .join('|')

  useEffect(() => {
    if (!host) return

    let gameOver = false
    try {
      gameOver = Chess.fromSetup(parseFen(fen).unwrap()).unwrap().isEnd()
    } catch {
      return
    }

    for (const profile of store.visibleProfiles()) {
      const session = store.session(profile.id)
      if (!session) continue

      const queued = timers.current.get(profile.id)
      if (queued) {
        clearTimeout(queued)
        timers.current.delete(profile.id)
      }

      if (!session.running || gameOver) {
        void host.stop(profile.id)
        continue
      }

      const request = {
        engineId: profile.id,
        enginePath: profile.path,
        fen,
        go: session.go,
        options: session.settings
          .filter((s) => s.value !== null && s.value !== undefined)
          .map((s) => ({ name: s.name, value: String(s.value) })),
      }
      const wait = Math.max(0, THROTTLE_MS - (Date.now() - (lastRun.current.get(profile.id) ?? 0)))
      const timer = setTimeout(() => {
        timers.current.delete(profile.id)
        lastRun.current.set(profile.id, Date.now())
        host
          .analyze(request)
          .catch((err) => store.markError(profile.id, err instanceof Error ? err.message : String(err)))
      }, wait)
      timers.current.set(profile.id, timer)
    }
    // Timers live in a ref so unrelated re-renders don't cancel pending
    // requests; unmount cleanup happens in the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])
}

/** Actions wrap the store with the process-control side effects (stop/kill) */
export function useEngineActions() {
  const store = useEngineStore()
  return useMemo(
    () => ({
      addProfile(profile: EngineProfile) {
        store.addProfile(profile)
      },
      updateProfile(id: string, patch: Partial<EngineProfile>) {
        // A hidden engine leaves the lifecycle loop, so stop its process here
        if (patch.visible === false) void window.engineHost?.stop(id)
        store.updateProfile(id, patch)
      },
      removeProfile(id: string) {
        void window.engineHost?.kill(id)
        store.removeProfile(id)
      },
      toggleRunning(id: string) {
        const running = store.toggleRunning(id)
        if (!running) void window.engineHost?.stop(id)
      },
      setRunning(id: string, running: boolean) {
        store.setRunning(id, running)
        if (!running) void window.engineHost?.stop(id)
      },
      setSetting(id: string, name: string, value: string | number | boolean | null) {
        store.setSetting(id, name, value)
      },
      setLines(id: string, lines: number) {
        store.setSetting(id, 'MultiPV', lines)
      },
      setGo(id: string, go: EngineProfile['go']) {
        store.setGo(id, go)
      },
      setSynced(id: string, synced: boolean) {
        store.setSynced(id, synced)
      },
      kill(id: string) {
        void window.engineHost?.kill(id)
        store.setRunning(id, false)
      },
      /** Pick the next unused palette color for a new profile */
      nextColor(): EngineProfile['color'] {
        return nextFreeColor(store.profiles)
      },
    }),
    [store],
  )
}
