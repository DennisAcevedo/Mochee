// Design tokens pulled from design/Tutor.dc.html.
// Source of truth for every color, font, radius, shadow and easing.
// src/styles/tokens.css mirrors these as CSS variables; keep the two in sync.

export const fonts = {
  ui: "'Figtree', system-ui, sans-serif",
  hand: "'Caveat', cursive",
  mono: "'JetBrains Mono', monospace",
} as const

export const colors = {
  bg: '#ece9e3',
  stageA: '#fffdf9',
  stageB: '#f4f0e9',
  stageC: '#e8e2d7',

  text: '#24232a',
  textSoft: '#2c2b33',
  textDim: '#5f5b55',
  muted: '#6c6861',
  muted2: '#8a857d',
  placeholder: '#9a958d',
  ink: '#3a3840',

  border: '#e0dbd2',
  borderBoard: '#e9e4db',
  borderOption: '#e2ddd3',
  borderIcon: '#e6e1d8',
  borderBadge: '#dcd6cc',
  divider: '#d9d3c8',
  panelDivider: '#ece8e1',

  surface: '#fbfaf7',
  surfaceBoard: '#fdfdfb',
  surfaceTint: '#efebe4',
  surfaceField: '#f1eee8',
  surfaceHover: '#f5f2ec',
  badgeDone: '#e9e5de',
  pipDone: '#bdb6aa',
  pdfLabel: '#9a5a4a',

  accent: 'oklch(0.52 0.1 202)',
  accentSoft: 'oklch(0.95 0.03 195)',
  accentInk: 'oklch(0.42 0.09 205)',
  accentBright: 'oklch(0.62 0.11 198)',
  accentHalo: 'oklch(0.9 0.05 195)',
  link: 'oklch(0.45 0.09 205)',
  linkHover: 'oklch(0.38 0.09 205)',

  ganttP1: 'oklch(0.9 0.06 195)',
  ganttP2: 'oklch(0.9 0.06 85)',
  ganttP3: 'oklch(0.9 0.06 300)',

  error: 'oklch(0.62 0.12 30)',
  errorSoft: 'oklch(0.96 0.025 30)',
} as const

export const radii = {
  stage: 28,
  inputBar: 24,
  board: 22,
  panel: 22,
  field: 18,
  option: 14,
  tabs: 14,
  button: 12,
  send: 13,
  row: 12,
  tab: 11,
  small: 10,
  pdf: 8,
  pip: 3,
} as const

export const shadows = {
  stage: 'inset 0 0 0 1px rgba(255,255,255,0.7), 0 1px 2px rgba(60,40,20,0.06)',
  bar: '0 1px 2px rgba(60,40,20,0.06)',
  board: '0 34px 60px -34px rgba(90,65,30,0.4), 0 2px 6px rgba(90,65,30,0.06)',
  panel: '0 24px 60px -24px rgba(70,50,25,0.35), 0 0 0 1px rgba(0,0,0,0.04)',
  button: '0 2px 8px rgba(60,40,20,0.08)',
  tab: '0 1px 3px rgba(60,40,20,0.12)',
  mic: '0 10px 22px -10px oklch(0.45 0.1 202 / 0.7)',
} as const

export const motion = {
  ease: 'cubic-bezier(.2,.8,.2,1)',
  panelMs: 450,
} as const

// Layout constants from the export's layout() method.
export const layout = {
  panelWidth: 360,
  panelGap: 16,
  panelInset: 12,
  boardMin: 280,
  boardMax: 420,
  boardFraction: 0.3,
  boardRightClosed: 28,
  boardInset: 20,
  regionMin: 0.2,
  regionLeft: 0.02,
} as const

export const theme = { fonts, colors, radii, shadows, motion, layout } as const