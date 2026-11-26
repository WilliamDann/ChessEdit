import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import { parseUci } from 'chessops'
import {
  ENGINE_COLORS,
  type EngineColorId,
  type EngineInfoEvent,
  type EngineProfile,
  type EngineSession,
  type EngineSetting,
  type EngineSnapshot,
  type UciOptionConfig,
} from './types'

const SAVE_DELAY_MS = 300

/**
 * Convert a PV (UCI) to SAN moves from `fen`. Falls back to the UCI string for
 * unparseable moves — engine output should still be visible.
 */
function pvToSan(fen: string, pvUci: string[]): string[] {
  try {
    const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
    const sans: string[] = []
    for (const uci of pvUci) {
      const move = parseUci(uci)
      if (!move) break
      sans.push(makeSan(pos, move))
      pos.play(move)
    }
    return sans.length === pvUci.length ? sans : pvUci
  } catch {
    return pvUci
  }
}

function defaultSettings(profile: Partial<EngineProfile>): EngineSetting[] {
  return Array.isArray(profile.settings) ? profile.settings : []
}

function defaultGo(profile: Partial<EngineProfile>) {
  return profile.go && typeof profile.go === 'object' && 'kind' in profile.go
    ? profile.go
    : ({ kind: 'infinite' } as const)
}

function sanitizeProfile(raw: unknown): EngineProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<EngineProfile>
  if (typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.path !== 'string') return null
  const color = ENGINE_COLORS.some((c) => c.id === p.color) ? (p.color as EngineColorId) : 'blue'
  const optionConfigs = Array.isArray(p.optionConfigs)
    ? p.optionConfigs.filter(
        (o): o is UciOptionConfig => !!o && typeof o.name === 'string' && typeof o.type === 'string',
      )
    : undefined
  return {
    id: p.id,
    name: p.name,
    path: p.path,
    color,
    go: defaultGo(p),
    settings: defaultSettings(p),
    ...(optionConfigs ? { optionConfigs } : {}),
    visible: p.visible !== false,
  }
}

/**
 * Engine feature state, kept outside ChessContext on purpose: analysis
 * updates arrive at up to ~10Hz per engine and must never re-render the
 * PGN tree. Components subscribe via useSyncExternalStore and read slices
 * in render.
 */
export class EngineStore {
  profiles: EngineProfile[] = []
  sessions: Record<string, EngineSession> = {}
  /** cache key `${engineId}|${fen}` -> latest snapshot for that position */
  snapshots = new Map<string, EngineSnapshot>()
  loaded = false
  private version = 0
  private seq = 0
  private listeners = new Set<() => void>()
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private bump() {
    this.version++
    for (const listener of this.listeners) listener()
  }

  async load() {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = await window.engineStore?.load()
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.profiles = parsed.map(sanitizeProfile).filter((p): p is EngineProfile => p !== null)
        }
      }
    } catch {
      // corrupt file — start empty
    }
    for (const profile of this.profiles) this.ensureSession(profile)
    this.bump()
  }

  private persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void window.engineStore?.save(JSON.stringify(this.profiles, null, 2))
    }, SAVE_DELAY_MS)
  }

  session(id: string): EngineSession | undefined {
    return this.sessions[id]
  }

  private ensureSession(profile: EngineProfile) {
    if (!this.sessions[profile.id]) {
      this.sessions[profile.id] = {
        running: false,
        go: profile.go,
        settings: profile.settings.map((s) => ({ ...s })),
        synced: true,
      }
    }
  }

  snapshot(id: string, fen: string): EngineSnapshot | undefined {
    return this.snapshots.get(`${id}|${fen}`)
  }

  visibleProfiles(): EngineProfile[] {
    return this.profiles.filter((p) => p.visible)
  }

  private sessionOf(id: string): EngineSession {
    const session = this.sessions[id]
    if (session) return session
    const profile = this.profiles.find((p) => p.id === id)
    if (profile) {
      this.ensureSession(profile)
      return this.sessions[id]
    }
    throw new Error(`no engine session for ${id}`)
  }

  // ── Profiles ───────────────────────────────────────────────────────────────

  addProfile(profile: EngineProfile) {
    this.profiles = [...this.profiles, profile]
    this.ensureSession(profile)
    this.persist()
    this.bump()
  }

  updateProfile(id: string, patch: Partial<EngineProfile>) {
    this.profiles = this.profiles.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p))
    const profile = this.profiles.find((p) => p.id === id)
    if (profile) {
      // Write-through for synced sessions, mirroring en-croissant's `synced`
      const session = this.sessionOf(id)
      if (session.synced) {
        if (patch.settings) session.settings = profile.settings.map((s) => ({ ...s }))
        if (patch.go) session.go = profile.go
      }
    }
    this.persist()
    this.bump()
  }

  removeProfile(id: string) {
    this.profiles = this.profiles.filter((p) => p.id !== id)
    delete this.sessions[id]
    for (const key of [...this.snapshots.keys()]) {
      if (key.startsWith(`${id}|`)) this.snapshots.delete(key)
    }
    this.persist()
    this.bump()
  }

  // ── Session state ──────────────────────────────────────────────────────────

  setRunning(id: string, running: boolean) {
    this.sessionOf(id).running = running
    this.bump()
  }

  /** @returns the new running state */
  toggleRunning(id: string): boolean {
    const session = this.sessionOf(id)
    session.running = !session.running
    this.bump()
    return session.running
  }

  setSetting(id: string, name: string, value: EngineSetting['value']) {
    const session = this.sessionOf(id)
    session.settings = session.settings.map((s) => (s.name === name ? { ...s, value } : s))
    if (session.synced) {
      const profile = this.profiles.find((p) => p.id === id)
      if (profile) {
        profile.settings = session.settings
        this.persist()
      }
    }
    this.bump()
  }

  setGo(id: string, go: EngineSession['go']) {
    const session = this.sessionOf(id)
    session.go = go
    if (session.synced) {
      const profile = this.profiles.find((p) => p.id === id)
      if (profile) {
        profile.go = go
        this.persist()
      }
    }
    this.bump()
  }

  setSynced(id: string, synced: boolean) {
    this.sessionOf(id).synced = synced
    this.bump()
  }

  markError(id: string, message: string) {
    const session = this.sessions[id]
    if (session) session.error = message
    this.bump()
  }

  /** Latest result for an engine at a position, cached and keyed by FEN. */
  applyInfo(info: EngineInfoEvent) {
    const session = this.sessions[info.engineId]
    if (session && session.error) session.error = undefined
    const snapshot: EngineSnapshot = {
      fen: info.fen,
      depth: info.depth,
      nodes: info.nodes,
      nps: info.nps,
      progress: info.progress,
      seq: ++this.seq,
      lines: info.lines.map((line) => ({
        ...line,
        pvSan: pvToSan(info.fen, line.pvUci),
      })),
    }
    this.snapshots.set(`${info.engineId}|${info.fen}`, snapshot)
    this.bump()
  }
}

/** First palette color not yet taken by another profile */
export function nextFreeColor(profiles: EngineProfile[]): EngineColorId {
  const used = new Set(profiles.map((p) => p.color))
  const free = ENGINE_COLORS.find((c) => !used.has(c.id))
  return free?.id ?? ENGINE_COLORS[profiles.length % ENGINE_COLORS.length].id
}
