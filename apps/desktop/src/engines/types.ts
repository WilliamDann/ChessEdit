import type { DrawBrush, DrawBrushes } from '@lichess-org/chessground/draw'

export type GoMode =
  | { kind: 'infinite' }
  | { kind: 'depth'; value: number }
  | { kind: 'time'; value: number }
  | { kind: 'nodes'; value: number }

export type EngineColorId = 'blue' | 'green' | 'red' | 'yellow'

/** Cloud engines stream analysis from a public API instead of a local UCI
 *  process — the panel, arrows, colors and per-FEN cache treat them the same */
export type EngineKind = 'local' | 'lichess-cloud' | 'chessdb'

export const ENGINE_COLORS: Array<{ id: EngineColorId; label: string; hex: string }> = [
  { id: 'blue', label: 'Blue', hex: '#4f8ef7' },
  { id: 'green', label: 'Green', hex: '#4caf50' },
  { id: 'red', label: 'Red', hex: '#ef5350' },
  { id: 'yellow', label: 'Yellow', hex: '#e2b93d' },
]

export type EngineSetting = {
  name: string
  value: string | number | boolean | null
}

/** A persisted engine profile (userData/engines.json) */
export type EngineProfile = {
  id: string
  name: string
  /** Local binary path; unused for cloud engines */
  path: string
  kind: EngineKind
  color: EngineColorId
  /** Default go mode; the session may override (write-through when synced).
   *  Cloud engines always analyze until the position changes. */
  go: GoMode
  /**
   * Current UCI option values. Deliberately minimal, like en-croissant:
   * MultiPV/Threads/Hash are always present (they drive the panel controls),
   * everything else is stored only while it differs from the engine default.
   * Cloud engines only carry MultiPV (the Lines selector).
   */
  settings: EngineSetting[]
  /**
   * Full UCI option metadata from `engine-get-config` (name, type, default,
   * min/max, vars) — drives the typed editors in the profiles dialog.
   * Cloud engines have none.
   */
  optionConfigs?: UciOptionConfig[]
  /** Shown in the Engines panel */
  visible: boolean
}

/** One-shot cloud analysis result (renderer converts pvUci → pvSan) */
export type RemoteAnalysis = {
  depth: number
  nodes: number
  lines: Array<Omit<EngineLine, 'pvSan'>>
}

/** Per-session runtime state of an engine (never persisted) */
export type EngineSession = {
  /** "Enabled" in en-croissant: play/pause of the search loop */
  running: boolean
  go: GoMode
  settings: EngineSetting[]
  /** Write setting/go edits through to the profile */
  synced: boolean
  error?: string
}

export type EngineLine = {
  multipv: number
  depth: number
  /** Centipawn score from the engine's point of view (side to move) */
  scoreCp?: number | null
  /** Mate distance from the engine's point of view */
  scoreMate?: number | null
  nodes: number
  nps: number
  pvUci: string[]
  pvSan: string[]
}

export type EngineSnapshot = {
  fen: string
  lines: EngineLine[]
  depth: number
  nodes: number
  nps: number
  /** 0..100, 0 = infinite search (animated), 100 = bestmove received */
  progress: number
  /** Monotonic store counter — lets consumers memoize on snapshot identity */
  seq: number
}

export type EngineInfoEvent = {
  engineId: string
  fen: string
  lines: Array<Omit<EngineLine, 'pvSan'>>
  depth: number
  nodes: number
  nps: number
  progress: number
}

export type EngineErrorEvent = {
  engineId: string
  message: string
}

export type UciOptionConfig = {
  name: string
  type: 'check' | 'spin' | 'string' | 'button' | 'combo'
  default?: string | number | boolean | null
  min?: number
  max?: number
  vars?: string[]
}

export type EngineConfig = {
  name: string
  options: UciOptionConfig[]
}

export type AnalyzeRequest = {
  engineId: string
  enginePath: string
  fen: string
  go: GoMode
  options: Array<{ name: string; value: string }>
}

declare global {
  interface Window {
    engineStore?: {
      load: () => Promise<string | null>
      save: (json: string) => Promise<void>
    }
    engineHost?: {
      openFile: () => Promise<string | null>
      getConfig: (path: string) => Promise<EngineConfig>
      analyze: (req: AnalyzeRequest) => Promise<boolean>
      stop: (engineId: string) => Promise<void>
      kill: (engineId: string) => Promise<void>
      remoteAnalyze: (req: {
        kind: 'lichess-cloud' | 'chessdb'
        fen: string
        lines: number
      }) => Promise<RemoteAnalysis | null>
      onInfo: (cb: (info: EngineInfoEvent) => void) => () => void
      onError: (cb: (err: EngineErrorEvent) => void) => () => void
    }
  }
}

/** chessground brushes for engine arrows, registered under `engine-*` names so
 *  engine shapes are unambiguous (isEngineShape) and never persist into PGN.
 *  Each PV line gets its own brush: the main line at full strength, every
 *  following line progressively lighter (l2..l5). */
const LINE_OPACITIES = [1, 0.55, 0.42, 0.32, 0.25]

export function engineBrushes(): DrawBrushes {
  const brushes: Record<string, DrawBrush> = {}
  for (const color of ENGINE_COLORS) {
    LINE_OPACITIES.forEach((opacity, index) => {
      const name = index === 0 ? `engine-${color.id}` : `engine-${color.id}-l${index + 1}`
      brushes[name] = { key: name, color: color.hex, opacity, lineWidth: 8 }
    })
  }
  return brushes as DrawBrushes
}

/** Brush name for the PV line at `lineIndex` (0 = main line); lines beyond
 *  the ladder reuse the faintest brush */
export function engineLineBrush(color: EngineColorId, lineIndex: number): string {
  const step = Math.min(lineIndex, LINE_OPACITIES.length - 1)
  return step === 0 ? `engine-${color}` : `engine-${color}-l${step + 1}`
}

/** Sensible targets when switching from Infinite to a finite go mode */
export const GO_DEFAULTS: Record<Exclude<GoMode['kind'], 'infinite'>, number> = {
  depth: 18,
  time: 5000,
  nodes: 1_000_000,
}
