import caveat700 from '@fontsource/caveat/files/caveat-latin-700-normal.woff?url'
import figtree600 from '@fontsource/figtree/files/figtree-latin-600-normal.woff?url'
import figtree800 from '@fontsource/figtree/files/figtree-latin-800-normal.woff?url'
import mono500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff?url'
import mono700 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url'
import { PALETTE } from '../layout3d'

// Look of the 3D mini browser windows, in world units (the window is
// WINDOWS.width x WINDOWS.height from layout3d.ts). One object to restyle
// the chrome, the notes page and the board. troika reads .woff, not .woff2.

export const FONTS = {
  bold: figtree800,
  semi: figtree600,
  hand: caveat700,
  mono: mono500,
  monoBold: mono700,
} as const

export type Accent = keyof typeof PALETTE

// Light tints of the accents, for chips and table rows.
export const TINT: Record<'teal' | 'coral' | 'sun' | 'violet' | 'lime' | 'pink' | 'indigo', string> = {
  teal: '#d4f1f3',
  coral: '#ffe0dc',
  sun: '#fff1c7',
  violet: '#e6dffd',
  lime: '#d9f4df',
  pink: '#ffe0ee',
  indigo: '#dde3fa',
}

// Text colour that reads on a solid accent fill.
export const ON_ACCENT: Record<keyof typeof TINT, string> = {
  teal: '#ffffff',
  coral: '#ffffff',
  sun: PALETTE.ink,
  violet: '#ffffff',
  lime: '#ffffff',
  pink: '#ffffff',
  indigo: '#ffffff',
}

export const WINDOW_STYLE = {
  urlHost: 'tutor.app/', // omnibox prefix in front of each tab's path
  depth: 0.06, // frame thickness
  bevel: 0.014, // rounded edge on the frame's front and back
  // Real key-light shadows from the frames. Off: their long floor shadows read
  // as grey slabs; the room's soft blobs ground the windows instead.
  castShadow: false,
  radius: 0.1, // frame corner radius
  frameColor: '#ffffff',
  z: 0.031, // front face of the frame; chrome layers stack from here
  layer: 0.004, // spacing between stacked flat layers

  focus: {
    damp: 7, // exponential damping rate for yaw, scale and glow
    lift: 0.25, // moves toward the camera when focused
    ring: { color: PALETTE.teal, stroke: 0.035, gap: 0.03 },
    glow: { color: PALETTE.teal, pad: 0.55, opacity: 0.55 },
  },

  tabStrip: {
    height: 0.27,
    color: '#e9e7e2',
    lights: { size: 0.026, gap: 0.072, x: 0.13, colors: [PALETTE.coral, PALETTE.sun, PALETTE.lime] },
    tabsX: 0.34, // tab row starts here (from the left edge)
    tabGap: 0.02,
    tabMaxW: 0.98,
    tabH: 0.21,
    tabRadius: 0.06,
    activeColor: '#ffffff',
    hoverColor: '#f6f4f0',
    accentBar: 0.022, // coloured top edge of the active tab
    title: { size: 0.068, color: PALETTE.ink, dim: '#6c6861' },
    dot: 0.022, // favicon dot radius
    close: { size: 0.045, color: '#8a857d' },
    plus: { size: 0.06, color: '#6c6861' },
    hover: { lift: 0.012, damp: 14 },
  },

  toolbar: {
    height: 0.23,
    color: '#ffffff',
    divider: '#ece8e1',
    glyph: { color: PALETTE.ink, dim: '#c9c4bb', size: 0.07, stroke: 0.014, gap: 0.12, x: 0.13 },
    omnibox: { x: 0.5, h: 0.15, color: '#f1eee8', text: '#5f5b55', size: 0.058, lock: PALETTE.lime },
  },

  content: {
    pad: 0.15,
    notesBg: '#eeedea',
    paper: '#ffffff',
    paperInset: 0.1, // grey margin around the paper
    paperShadow: 'rgba(0,0,0,0.08)',
    boardBg: '#fdfdfb',
  },

  notes: {
    gap: 0.05, // vertical gap between lines
    kicker: { size: 0.046, color: '#8a857d', letterSpacing: 0.08 },
    title: { size: 0.15, color: PALETTE.ink, underline: { w: 0.42, h: 0.026, color: PALETTE.teal } },
    heading: { size: 0.1, color: PALETTE.ink },
    text: { size: 0.074, color: '#3a3840', lineHeight: 1.32 },
    key: { size: 0.074, color: PALETTE.ink, bar: 0.026, padX: 0.07, padY: 0.04, radius: 0.035 },
    row: { h: 0.17, size: 0.07, headerSize: 0.05, headerBg: '#f1eee8', divider: '#ece8e1', pill: { h: 0.12, radius: 0.06 } },
    marker: { color: PALETTE.sun, padX: 0.04, padY: 0.025, radius: 0.03, damp: 10 },
    footer: { size: 0.052, color: '#8a857d', bar: { h: 0.012, color: PALETTE.teal, track: '#ece8e1' } },
  },

  board: {
    // Top edge of each part, measured down from the content's top-left corner.
    rows: { kicker: 0.14, heading: 0.24, gantt: 0.55, ticks: 0.79, working: 0.98, result: 1.25, footnote: 1.55 },
    kicker: { size: 0.046, color: '#8a857d' },
    heading: { size: 0.21, color: PALETTE.ink },
    gantt: { h: 0.22, radius: 0.05, gap: 0.014, label: 0.072, colors: ['teal', 'sun', 'violet'] as ('teal' | 'sun' | 'violet')[] },
    ticks: { h: 0.05, w: 0.012, size: 0.048, color: '#6c6861' },
    working: { size: 0.15, color: PALETTE.ink },
    result: { size: 0.21, color: PALETTE.ink, indent: 0.55, ring: { color: PALETTE.coral, stroke: 0.024, padX: 0.1, padY: 0.06, segments: 72, sweep: 1.1, spiral: 0.07, tilt: -0.08, damp: 4 } },
    footnote: { size: 0.064, color: '#5f5b55', dash: { w: 0.04, gap: 0.03, h: 0.008, color: '#d9d3c8' } },
    pop: { stiffness: 320, damping: 18 }, // spring for the step-by-step reveal
    replayStepMs: 220, // the reload button re-reveals the board one part per step
    quiz: {
      promptTop: 0.25,
      gridTop: 0.7, // top of the 2 x 2 answer grid
      // The prompt's bold part sits on a solid chip, measured from troika's caret positions.
      prompt: { size: 0.09, color: PALETTE.ink, boldColor: '#ffffff', chip: PALETTE.violet, chipPadX: 0.015, chipPadY: 0.012, chipRadius: 0.03 },
      option: { h: 0.3, gap: 0.08, radius: 0.06, depth: 0.05, size: 0.095, badge: 0.05, color: '#ffffff', edgeDrop: 0.022 },
      badgeColors: [PALETTE.teal, PALETTE.sun, PALETTE.violet, PALETTE.pink] as string[],
      right: PALETTE.lime,
      wrong: PALETTE.coral,
      hover: { lift: 0.05, scale: 1.04, damp: 14 },
      press: 0.02,
      feedback: { size: 0.068, idle: '#6c6861', h: 0.18, gap: 0.2 },
    },
  },
} as const
