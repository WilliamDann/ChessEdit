import type { ReactElement } from 'react'
import type { AddPanelOptions, DockviewApi, IDockviewPanelProps } from 'dockview'
import {
  Chessboard,
  MoveTree,
  ArrowNavigation,
  GameSelector,
  CommentEditor,
  NAGEditor,
  VariationEditor,
  HeaderEditor,
  ImportExport,
} from 'chessboard'

export type PanelId =
  | 'board'
  | 'tree'
  | 'games'
  | 'comment'
  | 'nag'
  | 'variations'
  | 'headers'
  | 'pgn'

type PanelDef = {
  title: string
  component: (props: IDockviewPanelProps) => ReactElement
  /** Where a panel docks when opened into an existing layout */
  position?: { referencePanel: PanelId; direction: 'right' | 'below' | 'inside' }
}

// Your lib's components are prop-less views over ChessContext, so a panel
// is just a name -> component mapping. The dock knows nothing about chess.
export const PANELS: Record<PanelId, PanelDef> = {
  board: { title: 'Board', component: () => <Chessboard /> },
  tree: {
    title: 'Move Tree',
    component: () => (
      <ArrowNavigation className="tree-nav">
        <MoveTree />
      </ArrowNavigation>
    ),
    position: { referencePanel: 'board', direction: 'right' },
  },
  games: { title: 'Games', component: () => <GameSelector />, position: { referencePanel: 'tree', direction: 'inside' } },
  comment: { title: 'Comments', component: () => <CommentEditor />, position: { referencePanel: 'tree', direction: 'inside' } },
  nag: { title: 'Annotations', component: () => <NAGEditor />, position: { referencePanel: 'tree', direction: 'inside' } },
  variations: { title: 'Variations', component: () => <VariationEditor />, position: { referencePanel: 'tree', direction: 'inside' } },
  headers: { title: 'Headers', component: () => <HeaderEditor />, position: { referencePanel: 'tree', direction: 'inside' } },
  pgn: { title: 'Import/Export', component: () => <ImportExport />, position: { referencePanel: 'tree', direction: 'inside' } },
}

export const DEFAULT_LAYOUT: PanelId[] = [
  'board',
  'tree',
  'games',
  'comment',
  'nag',
  'variations',
  'headers',
  'pgn',
]

/** Focus the panel if open, otherwise dock it near its reference panel */
export function addPanel(api: DockviewApi, id: PanelId): void {
  const existing = api.getPanel(id)
  if (existing) {
    existing.api.setActive()
    return
  }

  const def = PANELS[id]
  const options: AddPanelOptions = { id, component: id, title: def.title }
  if (def.position && api.getPanel(def.position.referencePanel)) {
    options.position = def.position
  }
  api.addPanel(options)
}

export function openPanels(api: DockviewApi, ids: PanelId[]): void {
  ids.forEach((id) => addPanel(api, id))
}

/** Default arrangement: board left, everything else as tabs in one
 *  group on the right with the Move Tree selected. Clears any
 *  existing panels first, so it also works as "reset layout". */
export function openDefaultLayout(api: DockviewApi): void {
  api.clear()
  openPanels(api, DEFAULT_LAYOUT)
  api.getPanel('tree')?.api.setActive()
}

export const components: Record<string, (props: IDockviewPanelProps) => ReactElement> =
  Object.fromEntries(Object.entries(PANELS).map(([id, def]) => [id, def.component]))
