/**
 * Theme system.
 *
 * A theme is just a base palette: background, foreground, accent and a
 * few semantic colors (from the omarchy theme's terminal palette). All
 * ~20 CSS tokens derive from those by mixing, so new themes (including
 * user-defined ones) need only a handful of colors.
 *
 * Built-in palettes mirror the omarchy desktop themes. Users can add
 * their own as JSON files (same shape as `Palette`) in
 * userData/themes/ — a file named e.g. tokyo-night.json overrides a
 * built-in of the same id.
 */

export type Palette = {
  label: string
  bg: string
  fg: string
  accent: string
  /** ANSI color1 (red) */
  red?: string
  /** ANSI color2 (green) */
  green?: string
  /** ANSI color3 (yellow) */
  yellow?: string
  /** ANSI color6 (cyan) */
  cyan?: string
}

export const DEFAULT_THEME_ID = 'default'

export const THEMES: Record<string, Palette> = {
  default: {
    label: 'Default (Light)',
    bg: '#f4f2ee',
    fg: '#1f1d1a',
    accent: '#93c5fd',
    red: '#e81123',
    green: '#4a7d4a',
    yellow: '#b45309',
    cyan: '#0e7490',
  },
  aether: { label: 'Aether', bg: '#f4f2ee', fg: '#1f1d1a', accent: '#93c5fd' },
  catppuccin: {
    label: 'Catppuccin',
    bg: '#1e1e2e',
    fg: '#cdd6f4',
    accent: '#89b4fa',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    cyan: '#94e2d5',
  },
  'catppuccin-latte': {
    label: 'Catppuccin Latte',
    bg: '#eff1f5',
    fg: '#4c4f69',
    accent: '#1e66f5',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    cyan: '#179299',
  },
  ethereal: {
    label: 'Ethereal',
    bg: '#060b1e',
    fg: '#ffcead',
    accent: '#7d82d9',
    red: '#ed5b5a',
    green: '#92a593',
    yellow: '#e9bb4f',
    cyan: '#a3bfd1',
  },
  everforest: {
    label: 'Everforest',
    bg: '#2d353b',
    fg: '#d3c6aa',
    accent: '#7fbbb3',
    red: '#e67e80',
    green: '#a7c080',
    yellow: '#dbbc7f',
    cyan: '#83c092',
  },
  'flexoki-light': {
    label: 'Flexoki Light',
    bg: '#fffcf0',
    fg: '#100f0f',
    accent: '#205ea6',
    red: '#d14d41',
    green: '#879a39',
    yellow: '#d0a215',
    cyan: '#3aa99f',
  },
  gruvbox: {
    label: 'Gruvbox',
    bg: '#282828',
    fg: '#d4be98',
    accent: '#7daea3',
    red: '#ea6962',
    green: '#a9b665',
    yellow: '#d8a657',
    cyan: '#89b482',
  },
  hackerman: {
    label: 'Hackerman',
    bg: '#0b0c16',
    fg: '#ddf7ff',
    accent: '#82fb9c',
    red: '#50f872',
    green: '#4fe88f',
    yellow: '#50f7d4',
    cyan: '#7cf8f7',
  },
  kanagawa: {
    label: 'Kanagawa',
    bg: '#1f1f28',
    fg: '#dcd7ba',
    accent: '#7e9cd8',
    red: '#c34043',
    green: '#76946a',
    yellow: '#c0a36e',
    cyan: '#6a9589',
  },
  lumon: { label: 'Lumon', bg: '#16242d', fg: '#d6e2ee', accent: '#8bc9eb' },
  'matte-black': {
    label: 'Matte Black',
    bg: '#121212',
    fg: '#bebebe',
    accent: '#e68e0d',
    red: '#d35f5f',
    green: '#ffc107',
    yellow: '#b91c1c',
    cyan: '#bebebe',
  },
  miasma: {
    label: 'Miasma',
    bg: '#222222',
    fg: '#c2c2b0',
    accent: '#78824b',
    red: '#685742',
    green: '#5f875f',
    yellow: '#b36d43',
    cyan: '#c9a554',
  },
  nord: {
    label: 'Nord',
    bg: '#2e3440',
    fg: '#d8dee9',
    accent: '#81a1c1',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    cyan: '#88c0d0',
  },
  'osaka-jade': {
    label: 'Osaka Jade',
    bg: '#111c18',
    fg: '#c1c497',
    accent: '#509475',
    red: '#ff5345',
    green: '#549e6a',
    yellow: '#459451',
    cyan: '#2dd5b7',
  },
  'retro-82': {
    label: 'Retro 82',
    bg: '#05182e',
    fg: '#f6dcac',
    accent: '#faa968',
    red: '#f85525',
    green: '#028391',
    yellow: '#e97b3c',
    cyan: '#8cbfb8',
  },
  ristretto: {
    label: 'Ristretto',
    bg: '#2c2525',
    fg: '#e6d9db',
    accent: '#f38d70',
    red: '#fd6883',
    green: '#adda78',
    yellow: '#f9cc6c',
    cyan: '#85dacc',
  },
  'rose-pine': {
    label: 'Rose Pine',
    bg: '#faf4ed',
    fg: '#575279',
    accent: '#56949f',
    red: '#b4637a',
    green: '#286983',
    yellow: '#ea9d34',
    cyan: '#d7827e',
  },
  'tokyo-night': {
    label: 'Tokyo Night',
    bg: '#1a1b26',
    fg: '#a9b1d6',
    accent: '#7aa2f7',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    cyan: '#449dab',
  },
  vantablack: {
    label: 'Vantablack',
    bg: '#000000',
    fg: '#ffffff',
    accent: '#8d8d8d',
    red: '#a4a4a4',
    green: '#b6b6b6',
    yellow: '#cecece',
    cyan: '#b0b0b0',
  },
  white: {
    label: 'White',
    bg: '#ffffff',
    fg: '#000000',
    accent: '#6e6e6e',
    red: '#2a2a2a',
    green: '#3a3a3a',
    yellow: '#4a4a4a',
    cyan: '#3e3e3e',
  },
}

const STORAGE_KEY = 'chessedit-theme'

export function isDark(p: Palette): boolean {
  const n = parseInt(p.bg.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}

/** Percent of `a` mixed into `b` */
const mix = (a: string, b: string, pct: number) =>
  `color-mix(in srgb, ${a} ${pct}%, ${b})`

/** Derive the full CSS token set from a base palette */
export function buildTokens(p: Palette): Record<string, string> {
  const dark = isDark(p)
  return {
    '--bg': p.bg,
    '--fg': p.fg,
    '--surface': mix(p.bg, p.fg, 92),
    '--border': mix(p.bg, p.fg, 70),
    '--border-soft': mix(p.bg, p.fg, 84),
    '--fg-muted': mix(p.fg, p.bg, 55),
    '--button-bg': mix(p.bg, p.fg, 88),
    '--hover': mix(p.bg, p.fg, 80),
    '--accent': p.accent,
    '--success': p.green ?? p.accent,
    '--danger': p.red ?? p.accent,
    '--on-danger': '#ffffff',
    '--pill-bg': mix(p.bg, p.fg, 93),
    '--pill-border': mix(p.bg, p.fg, 82),
    '--shadow': dark ? '0 8px 24px rgb(0 0 0 / 0.5)' : '0 8px 24px rgb(0 0 0 / 0.15)',
    '--nag-good': p.green ?? p.accent,
    '--nag-bad': p.red ?? p.accent,
    '--nag-interesting': p.cyan ?? p.accent,
    '--nag-dubious': p.yellow ?? p.accent,
    '--side-white': 'white',
    '--side-black': 'black',

    // Native form controls, scrollbars and selection follow the theme
    'color-scheme': dark ? 'dark' : 'light',
  }
}

/** Apply a palette to the document (tokens + color-scheme) */
export function applyTheme(p: Palette): void {
  const root = document.documentElement
  for (const [name, value] of Object.entries(buildTokens(p))) {
    root.style.setProperty(name, value)
  }
}

export function getStoredThemeId(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function saveThemeId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id)
}

declare global {
  interface Window {
    themeStore?: {
      /** User themes from userData/themes/*.json */
      load: () => Promise<Array<{ id: string; palette: Palette }>>
      /** Create (if needed) and open the user themes folder */
      openDir: () => Promise<void>
    }
  }
}
