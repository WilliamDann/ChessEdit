// Typed bridge to the main-process database feature (exposed by
// electron/preload.js as window.db, implemented in electron/databases.js).

export interface LocalDatabaseInfo {
  name: string
  title: string
  gameCount: number
}

export interface GameFilters {
  player?: string
  side?: 'white' | 'black' | 'any'
  result?: '1-0' | '0-1' | '1/2-1/2'
  since?: string
  until?: string
}

/** One row of opening statistics for a position — the shared shape of local
 *  database results and Lichess explorer moves (like en-croissant's
 *  PositionStats). `move` is UCI for local databases, SAN when coming from
 *  the explorer. */
export interface OpeningStats {
  move: string
  total: number
  white: number
  draws: number
  black: number
  avgElo: number | null
}

export interface DbGameRow {
  id: number
  white: string
  whiteElo: number | null
  black: string
  blackElo: number | null
  result: string
  event: string | null
  site: string | null
  date: string | null
  plyCount: number | null
}

export interface StoredGame {
  headers: Record<string, string>
  moves: string[]
}

export interface ImportProgress {
  name: string
  imported: number
  skipped: number
}

export interface ImportResult extends ImportProgress {}

export type ExplorerKind = 'masters' | 'lichess'

export interface ExplorerRequest {
  kind: ExplorerKind
  fen: string
  token?: string
}

export interface ExplorerMove {
  san?: string
  uci: string
  white: number
  draws: number
  black: number
  averageRating?: number
}

export interface ExplorerGame {
  id: string
  winner: 'white' | 'black' | null
  year: number
  white: { name?: string; rating?: number }
  black: { name?: string; rating?: number }
}

export interface ExplorerData {
  white: number
  draws: number
  black: number
  moves: ExplorerMove[]
  topGames: ExplorerGame[]
  recentGames?: ExplorerGame[]
}

declare global {
  interface Window {
    db: {
      list: () => Promise<LocalDatabaseInfo[]>
      importPgn: () => Promise<ImportResult | null>
      searchPosition: (req: {
        database: string
        fen: string
        filters?: GameFilters
      }) => Promise<OpeningStats[]>
      games: (req: {
        database: string
        fen?: string | null
        filters?: GameFilters
        page?: number
        pageSize?: number
      }) => Promise<{ games: DbGameRow[]; count: number }>
      loadGame: (req: { database: string; id: number }) => Promise<StoredGame | null>
      remove: (req: { name: string }) => Promise<boolean>
      explorer: (req: ExplorerRequest) => Promise<ExplorerData>
      /** OAuth sign-in: opens the browser, resolves when the flow completes */
      signInLichess: () => Promise<{ signedIn: boolean }>
      lichessSession: () => Promise<{ signedIn: boolean }>
      signOutLichess: () => Promise<{ signedIn: boolean }>
      onImportProgress: (cb: (progress: ImportProgress) => void) => () => void
    }
  }
}
